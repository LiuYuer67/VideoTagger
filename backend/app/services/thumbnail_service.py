from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from ..config import (
    FFMPEG_PATH,
    FFMPEG_TIMEOUT_SECONDS,
    THUMBNAILS_DIR,
    ffmpeg_available,
)
from ..core.errors import AppError

logger = logging.getLogger("videotagger")

_THUMB_RE = re.compile(r"^thumb_\d{4}\.jpg$")
_INDEX_FILE = "index.json"


def _thumbnail_dir(video_id: str) -> Path:
    return THUMBNAILS_DIR / video_id


def _count_for_duration(duration: float) -> int:
    if duration <= 0:
        return 1
    return int(max(24, min(96, round(duration * 1.5))))


def _no_window_kwargs() -> dict:
    if os.name == "nt":
        return {"creationflags": 0x08000000}
    return {}


def _load_index(video_id: str) -> list[dict] | None:
    folder = _thumbnail_dir(video_id)
    index_path = folder / _INDEX_FILE
    if not index_path.is_file():
        return None
    try:
        data = json.loads(index_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, list) or not data:
        return None
    for entry in data:
        if not isinstance(entry, dict):
            return None
        name = entry.get("file")
        if not isinstance(name, str) or not _THUMB_RE.match(name):
            return None
        if not (folder / name).is_file():
            return None
    return data


def get_thumbnail_index(video_id: str) -> list[dict] | None:
    return _load_index(video_id)


def _extract_thumbnail(
    video_path: Path,
    destination: Path,
    time_value: float,
) -> bool:
    destination.unlink(missing_ok=True)
    args = [
        str(FFMPEG_PATH or "ffmpeg"),
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-ss",
        f"{time_value:.6f}",
        "-i",
        str(video_path),
        "-map",
        "0:v:0",
        "-frames:v",
        "1",
        "-threads",
        "1",
        "-vf",
        "scale=320:-2",
        "-q:v",
        "4",
        "-y",
        str(destination),
    ]
    try:
        result = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=min(45, FFMPEG_TIMEOUT_SECONDS),
            **_no_window_kwargs(),
        )
    except (OSError, subprocess.SubprocessError):
        logger.exception("Could not extract thumbnail at %.3fs", time_value)
        destination.unlink(missing_ok=True)
        return False
    if result.returncode != 0 or not destination.is_file() or destination.stat().st_size == 0:
        logger.warning(
            "Thumbnail extraction failed at %.3fs: %s",
            time_value,
            (result.stderr or "")[-500:],
        )
        destination.unlink(missing_ok=True)
        return False
    return True


def ensure_thumbnails(
    video_id: str,
    video_path: Path,
    duration: float,
    *,
    progress=None,
) -> list[dict]:
    """Create the filmstrip cache if needed and return its index.

    Each thumbnail is extracted with an individual fast seek. This scales much
    better for long videos than decoding every frame through a single process.
    """
    existing = _load_index(video_id)
    if existing:
        return existing

    if not ffmpeg_available():
        raise AppError(
            "FFmpeg is not installed or could not be found. Install FFmpeg and restart the app.",
            code="FFMPEG_MISSING",
            status_code=503,
        )

    if duration <= 0:
        raise AppError("The video has no usable duration.", code="BAD_VIDEO")

    folder = _thumbnail_dir(video_id)
    if folder.exists():
        # Remove a partial previous attempt, not a valid cache.
        for path in folder.glob("*.jpg"):
            path.unlink(missing_ok=True)
    folder.mkdir(parents=True, exist_ok=True)

    count = _count_for_duration(duration)
    if progress:
        progress(0.0, "Generating timeline thumbnails…")

    requests: list[tuple[int, float, Path]] = []
    for idx in range(count):
        # Sample the middle of each filmstrip segment. Keeping the final sample
        # clear of the exact end avoids seeking past the video's last frame.
        requested = (idx + 0.5) * duration / count
        requested = min(max(0.0, requested), max(0.0, duration - 0.1))
        destination = folder / f"thumb_{idx + 1:04d}.jpg"
        requests.append((idx, requested, destination))

    completed = 0
    lock = threading.Lock()
    success: list[tuple[float, Path]] = []

    def worker(item: tuple[int, float, Path]) -> tuple[float, Path] | None:
        _idx, requested, destination = item
        ok = _extract_thumbnail(video_path, destination, requested)
        nonlocal completed
        with lock:
            completed += 1
            if progress:
                progress(
                    (completed / count) * 100,
                    f"Generating timeline thumbnails… {completed}/{count}",
                )
        return (requested, destination) if ok else None

    try:
        with ThreadPoolExecutor(max_workers=min(4, max(1, count))) as pool:
            futures = [pool.submit(worker, item) for item in requests]
            for future in as_completed(futures):
                result = future.result()
                if result is not None:
                    success.append(result)
    except Exception as exc:
        logger.exception("Thumbnail generation failed for %s", video_id)
        shutil.rmtree(folder, ignore_errors=True)
        raise AppError(
            "Timeline thumbnails could not be generated.",
            code="THUMBNAIL_FAILED",
            status_code=500,
        ) from exc

    if not success:
        shutil.rmtree(folder, ignore_errors=True)
        raise AppError(
            "No thumbnails could be read from this video.",
            code="THUMBNAIL_FAILED",
            status_code=500,
        )

    success.sort(key=lambda item: item[0])
    entries: list[dict] = []
    for idx, (time_value, path) in enumerate(success):
        entries.append(
            {
                "index": idx,
                "time": round(min(duration, max(0.0, time_value)), 6),
                "file": path.name,
            }
        )

    index_path = folder / _INDEX_FILE
    tmp_path = folder / f"{_INDEX_FILE}.tmp"
    tmp_path.write_text(json.dumps(entries, indent=2), encoding="utf-8")
    tmp_path.replace(index_path)

    logger.info(
        "Generated %d thumbnails for %s in %s", len(entries), video_id, folder
    )
    if progress:
        progress(100.0, "Timeline ready")
    return entries


def delete_thumbnails(video_id: str) -> None:
    shutil.rmtree(_thumbnail_dir(video_id), ignore_errors=True)


def thumbnail_urls(video_id: str) -> dict[str, str]:
    return {
        "folder": video_id,
        "pattern": f"/api/videos/{video_id}/thumbnail/thumb_XXXX.jpg",
    }
