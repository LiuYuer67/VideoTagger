from __future__ import annotations

import json
import logging
import math
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from ..config import (
    CACHE_DIR,
    DOWNLOAD_TIMEOUT_SECONDS,
    FFMPEG_TIMEOUT_SECONDS,
    MAX_DOWNLOAD_BYTES,
    ffmpeg_available,
    ffmpeg_dir,
    ffprobe_available,
    refresh_tool_paths,
    yt_dlp_available,
)
from ..core.errors import AppError
from ..core.jobs import Job
from .thumbnail_service import ensure_thumbnails, get_thumbnail_index

logger = logging.getLogger("videotagger")

VIDEO_EXTENSIONS = {".mp4", ".mkv", ".webm", ".mov", ".m4v"}
_YOUTUBE_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
    "youtu.be",
}
_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
_DOWNLOAD_PERCENT_RE = re.compile(r"\[download\]\s+([\d.]+)%")


def _no_window_kwargs() -> dict:
    if os.name == "nt":
        return {"creationflags": 0x08000000}
    return {}


def parse_youtube_url(raw_url: str) -> tuple[str, str]:
    """Validate a YouTube URL and return (video_id, canonical watch URL)."""
    value = (raw_url or "").strip()
    if not value:
        raise AppError("Enter a YouTube URL to continue.", code="INVALID_URL")
    if len(value) > 2048:
        raise AppError("That URL is too long.", code="INVALID_URL")
    try:
        parsed = urlparse(value)
    except ValueError as exc:
        raise AppError("That does not look like a valid URL.", code="INVALID_URL") from exc

    if parsed.scheme not in {"http", "https"}:
        raise AppError(
            "Enter a full YouTube link beginning with https://.",
            code="INVALID_URL",
        )
    host = (parsed.hostname or "").lower().rstrip(".")
    if host not in _YOUTUBE_HOSTS:
        raise AppError(
            "Only YouTube links are supported. Paste a youtube.com, youtu.be, or YouTube Shorts link.",
            code="UNSUPPORTED_URL",
        )

    video_id = ""
    parts = [part for part in parsed.path.split("/") if part]
    if host == "youtu.be":
        if parts:
            video_id = parts[0]
    elif parts:
        if parts[0] in {"shorts", "embed", "live", "v"} and len(parts) > 1:
            video_id = parts[1]
        elif parts[0] == "watch":
            video_id = (parse_qs(parsed.query).get("v") or [""])[0]
        elif len(parts) == 1 and _VIDEO_ID_RE.match(parts[0]):
            video_id = parts[0]
    if not video_id:
        video_id = (parse_qs(parsed.query).get("v") or [""])[0]

    video_id = video_id.strip()
    if not _VIDEO_ID_RE.match(video_id):
        raise AppError(
            "This YouTube URL does not contain a valid video ID.",
            code="INVALID_URL",
        )
    return video_id, f"https://www.youtube.com/watch?v={video_id}"


def _parse_fraction(value: str | None) -> float:
    if not value or value in {"0/0", "N/A"}:
        return 0.0
    if "/" in value:
        numerator, denominator = value.split("/", 1)
        try:
            num = float(numerator)
            den = float(denominator)
            return num / den if den else 0.0
        except ValueError:
            return 0.0
    try:
        return float(value)
    except ValueError:
        return 0.0


def probe_video(video_path: Path) -> dict:
    refresh_tool_paths()
    if not ffprobe_available():
        raise AppError(
            "FFprobe is not installed or could not be found. Install FFmpeg and restart the app.",
            code="FFPROBE_MISSING",
            status_code=503,
        )
    if not video_path.is_file():
        raise AppError("The video file could not be found.", code="VIDEO_MISSING", status_code=404)

    from ..config import FFPROBE_PATH

    args = [
        str(FFPROBE_PATH),
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(video_path),
    ]
    try:
        result = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=45,
            **_no_window_kwargs(),
        )
    except (OSError, subprocess.SubprocessError) as exc:
        logger.exception("ffprobe failed for %s", video_path)
        raise AppError(
            "The video could not be inspected. It may be corrupt.",
            code="PROBE_FAILED",
            status_code=422,
        ) from exc
    if result.returncode != 0:
        logger.error("ffprobe failed: %s", result.stderr[-2000:])
        raise AppError(
            "The video could not be inspected. It may be corrupt or use an unsupported codec.",
            code="PROBE_FAILED",
            status_code=422,
        )
    try:
        payload = json.loads(result.stdout)
    except ValueError as exc:
        raise AppError("The video metadata was invalid.", code="PROBE_FAILED") from exc

    streams = payload.get("streams") or []
    stream = next(
        (item for item in streams if item.get("codec_type") == "video"), None
    )
    if not stream:
        raise AppError(
            "This file does not contain a video stream.", code="BAD_VIDEO", status_code=422
        )

    fmt = payload.get("format") or {}
    duration = 0.0
    for candidate in (fmt.get("duration"), stream.get("duration")):
        try:
            duration = float(candidate)
        except (TypeError, ValueError):
            continue
        if duration > 0:
            break
    if not math.isfinite(duration) or duration <= 0:
        raise AppError(
            "The video duration could not be determined.", code="BAD_VIDEO", status_code=422
        )

    width = int(stream.get("width") or 0)
    height = int(stream.get("height") or 0)
    rotation = 0
    for side_data in stream.get("side_data_list") or []:
        if not isinstance(side_data, dict):
            continue
        if "rotation" in side_data:
            try:
                rotation = int(float(side_data["rotation"]))
            except (TypeError, ValueError):
                pass
    tags = stream.get("tags") or {}
    if tags.get("rotate"):
        try:
            rotation = int(float(tags["rotate"]))
        except (TypeError, ValueError):
            pass
    if abs(rotation) % 180 == 90:
        width, height = height, width

    if width <= 0 or height <= 0:
        raise AppError("The video dimensions are invalid.", code="BAD_VIDEO", status_code=422)
    if width > 32768 or height > 32768:
        raise AppError(
            "This video resolution is too large to process.", code="BAD_VIDEO", status_code=422
        )

    fps = _parse_fraction(stream.get("avg_frame_rate")) or _parse_fraction(
        stream.get("r_frame_rate")
    )
    if not math.isfinite(fps) or fps <= 0 or fps > 1000:
        fps = 30.0
    fps = round(fps, 6)

    try:
        size = int(fmt.get("size") or video_path.stat().st_size)
    except (TypeError, ValueError, OSError):
        size = 0

    return {
        "duration": round(duration, 6),
        "width": width,
        "height": height,
        "fps": fps,
        "codec": str(stream.get("codec_name") or ""),
        "size": size,
    }


def _meta_path(video_id: str) -> Path:
    return CACHE_DIR / f"{video_id}.meta.json"


def _read_meta(video_id: str) -> dict | None:
    path = _meta_path(video_id)
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    if data.get("video_id") != video_id:
        return None
    return data


def _write_meta(video_id: str, meta: dict) -> None:
    path = _meta_path(video_id)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    tmp.replace(path)


def _find_video_file(video_id: str) -> Path | None:
    candidates: list[Path] = []
    for ext in VIDEO_EXTENSIONS:
        candidate = CACHE_DIR / f"{video_id}{ext}"
        if candidate.is_file() and candidate.stat().st_size > 0:
            candidates.append(candidate)
    if candidates:
        return max(candidates, key=lambda p: p.stat().st_size)
    return None


def get_cached_video(video_id: str) -> tuple[Path, dict] | None:
    if not re.match(r"^[A-Za-z0-9_-]{1,64}$", video_id):
        return None
    meta = _read_meta(video_id)
    path: Path | None = None
    if meta:
        filename = str(meta.get("filename") or "")
        if filename and Path(filename).name == filename:
            candidate = (CACHE_DIR / filename).resolve()
            try:
                candidate.relative_to(CACHE_DIR.resolve())
            except ValueError:
                candidate = None  # type: ignore[assignment]
            if candidate and candidate.is_file() and candidate.stat().st_size > 0:
                path = candidate
    if path is None:
        path = _find_video_file(video_id)
    if path is None:
        return None
    return path, meta or {}


def _title_from_yt_info(video_id: str) -> str:
    for path in CACHE_DIR.glob(f"{video_id}.info.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            title = str(data.get("title") or "").strip()
            if title:
                return title
        except (OSError, ValueError):
            continue
    return ""


def build_video_info(meta: dict) -> dict:
    video_id = str(meta["video_id"])
    thumbnails = get_thumbnail_index(video_id) or []
    return {
        "video_id": video_id,
        "source_url": str(meta.get("source_url") or ""),
        "filename": str(meta.get("filename") or ""),
        "title": str(meta.get("title") or meta.get("video_id") or "Untitled video"),
        "duration": float(meta.get("duration") or 0),
        "width": int(meta.get("width") or 0),
        "height": int(meta.get("height") or 0),
        "fps": float(meta.get("fps") or 30),
        "size": int(meta.get("size") or 0),
        "codec": str(meta.get("codec") or ""),
        "available": True,
        "stream_url": f"/api/videos/{video_id}/stream",
        "thumbnail_count": len(thumbnails),
        "thumbnails": [
            {
                "index": int(item["index"]),
                "time": float(item["time"]),
                "url": f"/api/videos/{video_id}/thumbnail/{item['file']}",
            }
            for item in thumbnails
        ],
    }


def get_video_info(video_id: str, *, ensure_thumbs: bool = False) -> dict:
    cached = get_cached_video(video_id)
    if not cached:
        raise AppError(
            "That video is not in the local cache.",
            code="VIDEO_MISSING",
            status_code=404,
        )
    path, meta = cached
    if ensure_thumbs:
        duration = float(meta.get("duration") or 0)
        if duration <= 0:
            probed = probe_video(path)
            meta.update(probed)
            duration = float(probed["duration"])
        ensure_thumbnails(video_id, path, duration)
        meta = _read_meta(video_id) or meta
        meta.setdefault("video_id", video_id)
        meta.setdefault("filename", path.name)
    return build_video_info(meta)


def _build_download_command(url: str, video_id: str) -> list[str]:
    template = str(CACHE_DIR / f"{video_id}.%(ext)s")
    if yt_dlp_available():
        try:
            import yt_dlp  # noqa: F401

            base = [sys.executable, "-m", "yt_dlp"]
        except Exception:
            base = [shutil.which("yt-dlp") or "yt-dlp"]
    else:
        base = [shutil.which("yt-dlp") or "yt-dlp"]

    args = [
        *base,
        "--no-playlist",
        "--newline",
        "--no-warnings",
        "--no-mtime",
        "--socket-timeout",
        "20",
        "--retries",
        "3",
        "--fragment-retries",
        "3",
        "--write-info-json",
        "--merge-output-format",
        "mp4",
        "--format",
        "bv*[ext=mp4][vcodec^=avc1]+ba[ext=m4a]/bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b",
        "--max-filesize",
        f"{MAX_DOWNLOAD_BYTES}",
        "--output",
        template,
        url,
    ]
    location = ffmpeg_dir()
    if location:
        args.extend(["--ffmpeg-location", location])
    return args


def _friendly_download_error(output: str) -> str:
    lowered = output.lower()
    if "sign in" in lowered or "confirm you're not a bot" in lowered:
        return (
            "YouTube requested sign-in verification for this video. Try again later or use a "
            "different public video."
        )
    if "private video" in lowered:
        return "This video is private and cannot be downloaded."
    if "video unavailable" in lowered or "removed" in lowered:
        return "This video is unavailable on YouTube."
    if "requested format is not available" in lowered:
        return "YouTube did not provide a downloadable format for this video."
    if "http error 403" in lowered or "forbidden" in lowered:
        return "YouTube refused the download request. The video may be region-restricted."
    if "max-filesize" in lowered or "larger than max" in lowered:
        return "This video is larger than the configured download limit."
    if "ffmpeg" in lowered and ("not found" in lowered or "not installed" in lowered):
        return "FFmpeg is required to merge the downloaded video and audio."
    return "The video could not be downloaded. Check the URL and try another video."


def download_video(url: str, video_id: str, job: Job) -> Path:
    refresh_tool_paths()
    if not yt_dlp_available():
        raise AppError(
            "yt-dlp is not installed. Install the backend requirements and restart the app.",
            code="YTDLP_MISSING",
            status_code=503,
        )
    if not ffmpeg_available():
        raise AppError(
            "FFmpeg is not installed or could not be found. Install FFmpeg and restart the app.",
            code="FFMPEG_MISSING",
            status_code=503,
        )

    free = shutil.disk_usage(CACHE_DIR).free
    if free < 300 * 1024 * 1024:
        raise AppError(
            "There is not enough free disk space to download this video.",
            code="NO_DISK_SPACE",
            status_code=507,
        )

    args = _build_download_command(url, video_id)
    logger.info("Starting yt-dlp for %s", video_id)
    job.update(
        progress=4,
        phase="download",
        message="Connecting to YouTube…",
    )

    try:
        process = subprocess.Popen(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            **_no_window_kwargs(),
        )
    except OSError as exc:
        logger.exception("Could not start yt-dlp")
        raise AppError(
            "yt-dlp could not be started. Check the backend installation.",
            code="YTDLP_FAILED",
            status_code=503,
        ) from exc

    started = time.monotonic()
    all_output: list[str] = []
    highest = 0.0
    try:
        assert process.stdout is not None
        for line in process.stdout:
            line = line.rstrip()
            if line:
                all_output.append(line)
                all_output = all_output[-80:]
            match = _DOWNLOAD_PERCENT_RE.search(line)
            if match:
                try:
                    percent = float(match.group(1))
                except ValueError:
                    percent = highest
                highest = max(highest, percent)
                job.update(
                    progress=4 + highest * 0.74,
                    phase="download",
                    message=f"Downloading video… {highest:.0f}%",
                )
            elif "Destination:" in line:
                job.update(phase="download", message="Downloading video…")
            if time.monotonic() - started > DOWNLOAD_TIMEOUT_SECONDS:
                process.kill()
                raise AppError(
                    "The download took too long and was stopped.",
                    code="DOWNLOAD_TIMEOUT",
                    status_code=504,
                )
        process.wait(timeout=30)
    except AppError:
        raise
    except Exception as exc:
        logger.exception("yt-dlp process failed")
        process.kill()
        raise AppError(
            "The download stopped unexpectedly.", code="DOWNLOAD_FAILED", status_code=502
        ) from exc
    finally:
        if process.poll() is None:
            process.kill()

    output = "\n".join(all_output)
    if process.returncode != 0:
        logger.error("yt-dlp exited %s:\n%s", process.returncode, output[-6000:])
        raise AppError(
            _friendly_download_error(output),
            code="DOWNLOAD_FAILED",
            status_code=502,
        )

    path = _find_video_file(video_id)
    if not path:
        raise AppError(
            "The download completed but no video file was produced.",
            code="DOWNLOAD_FAILED",
            status_code=502,
        )

    return path


def _clean_youtube_sidecars(video_id: str) -> None:
    for info_path in CACHE_DIR.glob(f"{video_id}.info.json"):
        try:
            info_path.unlink()
        except OSError:
            pass
    for aux in list(CACHE_DIR.glob(f"{video_id}.webp")) + list(
        CACHE_DIR.glob(f"{video_id}.jpg")
    ):
        try:
            aux.unlink()
        except OSError:
            pass


def _ensure_meta(
    video_id: str,
    source_url: str,
    path: Path,
    *,
    title: str = "",
    probed: dict | None = None,
) -> dict:
    meta = _read_meta(video_id) or {}
    details = probed or probe_video(path)
    meta.update(
        {
            "video_id": video_id,
            "source_url": source_url or meta.get("source_url") or "",
            "filename": path.name,
            "title": title or meta.get("title") or _title_from_yt_info(video_id) or video_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            **details,
        }
    )
    _write_meta(video_id, meta)
    _clean_youtube_sidecars(video_id)
    return meta


def load_video_job(url: str, job: Job) -> dict:
    video_id, canonical = parse_youtube_url(url)
    job.update(
        progress=1,
        phase="cache",
        message="Checking the local video cache…",
    )

    cached = get_cached_video(video_id)
    path: Path | None = None
    probed: dict | None = None
    if cached:
        path, existing_meta = cached
        try:
            probed = probe_video(path)
            job.update(
                progress=82,
                phase="metadata",
                message="Using cached video",
            )
        except AppError as exc:
            logger.warning("Cached video %s is invalid: %s", video_id, exc.message)
            # A corrupt cache entry cannot be used. Move it aside rather than
            # deleting it outright so a bad file can be diagnosed later.
            try:
                corrupt_dir = CACHE_DIR / "corrupt"
                corrupt_dir.mkdir(exist_ok=True)
                target = corrupt_dir / path.name
                if target.exists():
                    target.unlink()
                path.replace(target)
            except OSError:
                pass
            path = None
            probed = None
        else:
            meta = _ensure_meta(
                video_id,
                canonical,
                path,
                title=str(existing_meta.get("title") or ""),
                probed=probed,
            )
    else:
        meta = {}

    if path is None:
        path = download_video(canonical, video_id, job)
        job.update(
            progress=82,
            phase="metadata",
            message="Reading video metadata…",
        )
        probed = probe_video(path)
        meta = _ensure_meta(
            video_id,
            canonical,
            path,
            title=_title_from_yt_info(video_id) or video_id,
            probed=probed,
        )
    elif not meta:
        meta = _ensure_meta(video_id, canonical, path, probed=probed)

    duration = float(meta.get("duration") or 0)
    job.update(
        progress=86,
        phase="thumbnails",
        message="Generating timeline thumbnails…",
    )
    ensure_thumbnails(
        video_id,
        path,
        duration,
        progress=lambda pct, msg: job.update(
            progress=86 + pct * 0.12, phase="thumbnails", message=msg
        ),
    )
    meta = _read_meta(video_id) or meta
    job.update(progress=99, phase="complete", message="Preparing workspace…")
    return build_video_info(meta)


def cached_video_info(video_id: str, *, ensure_thumbs: bool = False) -> dict:
    return get_video_info(video_id, ensure_thumbs=ensure_thumbs)


def video_file_for(video_id: str) -> Path:
    cached = get_cached_video(video_id)
    if not cached:
        raise AppError("The video file is missing.", code="VIDEO_MISSING", status_code=404)
    return cached[0]


def extract_frame(video_id: str, time_value: float) -> bytes:
    path = video_file_for(video_id)
    refresh_tool_paths()
    if not ffmpeg_available():
        raise AppError(
            "FFmpeg is not installed or could not be found.",
            code="FFMPEG_MISSING",
            status_code=503,
        )
    from ..config import FFMPEG_PATH

    clamped = max(0.0, time_value)
    args = [
        str(FFMPEG_PATH),
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        f"{clamped:.6f}",
        "-i",
        str(path),
        "-frames:v",
        "1",
        "-f",
        "image2pipe",
        "-vcodec",
        "mjpeg",
        "-q:v",
        "3",
        "-",
    ]
    try:
        result = subprocess.run(
            args,
            capture_output=True,
            timeout=FFMPEG_TIMEOUT_SECONDS,
            **_no_window_kwargs(),
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise AppError(
            "A frame could not be extracted from this video.",
            code="FRAME_FAILED",
            status_code=500,
        ) from exc
    if result.returncode != 0 or not result.stdout:
        logger.error("Frame extraction failed: %s", result.stderr[-2000:])
        raise AppError(
            "A frame could not be extracted at that time.",
            code="FRAME_FAILED",
            status_code=500,
        )
    return result.stdout
