from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

from ..config import EXPORTS_DIR, FFMPEG_PATH, FFMPEG_TIMEOUT_SECONDS, ffmpeg_available
from ..core.errors import AppError
from ..core.jobs import Job
from ..models import Annotation, Project
from .project_service import load_project
from .video_service import get_cached_video, probe_video

logger = logging.getLogger("videotagger")

_SAFE_FOLDER_RE = re.compile(r'^[^<>:"/\\|?*\x00-\x1f.]{1,180}$')
_WINDOWS_RESERVED = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}


def _slugify(value: str, fallback: str = "video") -> str:
    value = (value or "").strip()
    # Remove characters Windows does not allow in file names. Unicode letters
    # are kept so non-English titles remain recognizable.
    value = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", value)
    value = re.sub(r"\s+", "_", value)
    value = re.sub(r"[^\w.\-]+", "_", value, flags=re.UNICODE)
    value = re.sub(r"_+", "_", value).strip(" ._-")
    if not value:
        value = fallback
    if value.upper() in _WINDOWS_RESERVED:
        value = f"_{value}"
    return value[:60].rstrip(" ._-") or fallback


def _no_window_kwargs() -> dict:
    if os.name == "nt":
        return {"creationflags": 0x08000000}
    return {}


def _create_export_folder(project: Project) -> Path:
    base = _slugify(project.video.title or project.video.video_id)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    for attempt in range(0, 100):
        suffix = f"_{attempt}" if attempt else ""
        name = f"{base}_export_{timestamp}{suffix}"
        folder = EXPORTS_DIR / name
        try:
            folder.mkdir(parents=True, exist_ok=False)
            return folder
        except FileExistsError:
            continue
        except OSError as exc:
            raise AppError(
                "The export folder could not be created. Check free disk space and folder permissions.",
                code="EXPORT_FOLDER_FAILED",
                status_code=507,
            ) from exc
    raise AppError(
        "A unique export folder could not be created.",
        code="EXPORT_FOLDER_FAILED",
        status_code=500,
    )


def _safe_crop(annotation: Annotation, width: int, height: int) -> tuple[int, int, int, int]:
    bbox = annotation.bbox
    x = int(round(bbox.x * width))
    y = int(round(bbox.y * height))
    x = max(0, min(width - 1, x))
    y = max(0, min(height - 1, y))
    crop_w = int(round(bbox.width * width))
    crop_h = int(round(bbox.height * height))
    crop_w = max(1, min(width - x, crop_w))
    crop_h = max(1, min(height - y, crop_h))
    return x, y, crop_w, crop_h


def _frame_seek(annotation: Annotation, project: Project) -> float:
    fps = project.video.fps or 30.0
    duration = project.video.duration
    # FFmpeg's input seek keeps the first frame at or after the seek target.
    # Aim a fraction of a frame before the desired frame so the decoder lands
    # on that frame rather than the next one.
    seconds = (annotation.frame_index - 0.25) / fps
    if seconds < -0.01 or seconds >= duration + 1:
        seconds = annotation.timestamp - 0.25 / fps
    return max(0.0, min(max(0.0, duration - 0.001), seconds))


def _extract_crops(
    video_path: Path,
    seek_seconds: float,
    items: list[tuple[tuple[int, int, int, int], Path]],
) -> None:
    """Extract one or more crops from a single decoded frame."""
    if not ffmpeg_available():
        raise AppError(
            "FFmpeg is not installed or could not be found.",
            code="FFMPEG_MISSING",
            status_code=503,
        )
    count = len(items)
    if count == 0:
        return
    parts = [
        destination.with_name(f"{destination.stem}.part.png")
        for _crop, destination in items
    ]
    for part in parts:
        part.unlink(missing_ok=True)

    branches: list[str] = []
    if count == 1:
        (x, y, width, height), _destination = items[0]
        graph = f"[0:v]crop={width}:{height}:{x}:{y}[c0]"
    else:
        split_outputs = "".join(f"[v{i}]" for i in range(count))
        branches.append(f"[0:v]split={count}{split_outputs}")
        for index, ((x, y, width, height), _destination) in enumerate(items):
            branches.append(f"[v{index}]crop={width}:{height}:{x}:{y}[c{index}]")
        graph = ";".join(branches)

    args = [
        str(FFMPEG_PATH or "ffmpeg"),
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        f"{seek_seconds:.6f}",
        "-i",
        str(video_path),
        "-filter_complex",
        graph,
    ]
    for index, part in enumerate(parts):
        args.extend(["-map", f"[c{index}]", "-frames:v", "1", "-y", str(part)])

    try:
        result = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=FFMPEG_TIMEOUT_SECONDS,
            **_no_window_kwargs(),
        )
    except (OSError, subprocess.SubprocessError) as exc:
        for part in parts:
            part.unlink(missing_ok=True)
        raise AppError(
            "A frame could not be extracted during export.",
            code="EXPORT_FRAME_FAILED",
            status_code=500,
        ) from exc
    success = result.returncode == 0 and all(
        part.is_file() and part.stat().st_size >= 16 for part in parts
    )
    if not success:
        for part in parts:
            part.unlink(missing_ok=True)
        logger.error("Export crop failed: %s", (result.stderr or "")[-2500:])
        raise AppError(
            "A crop could not be written during export.",
            code="EXPORT_FRAME_FAILED",
            status_code=500,
        )
    try:
        for part, (_crop, destination) in zip(parts, items):
            with part.open("rb") as handle:
                if handle.read(8) != b"\x89PNG\r\n\x1a\n":
                    raise OSError("not a PNG")
        for part, (_crop, destination) in zip(parts, items):
            os.replace(part, destination)
    except OSError as exc:
        for part in parts:
            part.unlink(missing_ok=True)
        raise AppError(
            "A cropped image could not be saved.",
            code="EXPORT_WRITE_FAILED",
            status_code=507,
        ) from exc


def _write_tags(destination: Path, tags: list[str]) -> None:
    try:
        destination.write_text(", ".join(tags), encoding="utf-8")
    except OSError as exc:
        raise AppError(
            "A tag file could not be saved.",
            code="EXPORT_WRITE_FAILED",
            status_code=507,
        ) from exc


def export_project_job(project_id: str, job: Job) -> dict:
    project = load_project(project_id)
    if not project.annotations:
        raise AppError(
            "There are no tagged regions to export yet.",
            code="NOTHING_TO_EXPORT",
            status_code=422,
        )
    cached = get_cached_video(project.video.video_id)
    if not cached:
        raise AppError(
            "The source video is missing from the local cache. Reload it before exporting.",
            code="VIDEO_MISSING",
            status_code=404,
        )
    video_path, _meta = cached

    probe = probe_video(video_path)
    width = int(probe["width"])
    height = int(probe["height"])
    fps = float(probe["fps"])
    if fps > 0 and abs(fps - project.video.fps) > 0.01:
        logger.info(
            "Project fps %.4f differs from probed fps %.4f; using stored project timing",
            project.video.fps,
            fps,
        )

    free = shutil.disk_usage(EXPORTS_DIR).free
    if free < max(100 * 1024 * 1024, len(project.annotations) * 512 * 1024):
        raise AppError(
            "There is not enough free disk space to export these crops.",
            code="NO_DISK_SPACE",
            status_code=507,
        )

    folder = _create_export_folder(project)
    annotations = sorted(
        project.annotations,
        key=lambda item: (item.timestamp, item.frame_index, item.id),
    )
    total = len(annotations)
    exported = 0
    empty_tags = 0
    job.update(progress=0, phase="export", message="Preparing export…")

    # Annotations are sorted, so regions that share a frame are adjacent. Decode
    # and seek each distinct frame once, then emit every crop from that frame in
    # a single FFmpeg filter graph.
    groups: list[list[tuple[int, Annotation]]] = []
    for index, annotation in enumerate(annotations, start=1):
        if groups and groups[-1][-1][1].frame_index == annotation.frame_index:
            groups[-1].append((index, annotation))
        else:
            groups.append([(index, annotation)])

    try:
        for group in groups:
            first_index, first_annotation = group[0]
            last_index = group[-1][0]
            job.update(
                progress=((first_index - 1) / total) * 100,
                phase="export",
                message=(
                    f"Exporting {first_index} of {total}…"
                    if first_index == last_index
                    else f"Exporting {first_index}–{last_index} of {total}…"
                ),
            )
            seek = _frame_seek(first_annotation, project)
            items: list[tuple[tuple[int, int, int, int], Path]] = []
            for index, annotation in group:
                crop = _safe_crop(annotation, width, height)
                png_path = folder / f"{index}.png"
                items.append((crop, png_path))
            _extract_crops(video_path, seek, items)

            for index, annotation in group:
                png_path = folder / f"{index}.png"
                txt_path = folder / f"{index}.txt"
                _write_tags(txt_path, annotation.tags)
                if not annotation.tags:
                    empty_tags += 1
                if not png_path.is_file() or not txt_path.is_file():
                    raise AppError(
                        f"Export did not finish writing files for region {index}.",
                        code="EXPORT_WRITE_FAILED",
                        status_code=500,
                    )
                exported += 1
                job.update(
                    progress=(index / total) * 100,
                    phase="export",
                    message=f"Exported {index} of {total}",
                )
    except Exception:
        # A partial folder must never look like a successful final export.
        shutil.rmtree(folder, ignore_errors=True)
        raise

    try:
        total_size = sum(p.stat().st_size for p in folder.iterdir() if p.is_file())
    except OSError:
        total_size = 0

    return {
        "folder_name": folder.name,
        "path": str(folder),
        "image_count": exported,
        "tag_file_count": exported,
        "empty_tag_count": empty_tags,
        "total_bytes": total_size,
        "width": width,
        "height": height,
    }


def export_folder(folder_name: str) -> Path:
    if (
        not _SAFE_FOLDER_RE.match(folder_name)
        or ".." in folder_name
        or folder_name in {".", ".."}
    ):
        raise AppError("Invalid export folder.", code="INVALID_EXPORT_FOLDER")
    folder = (EXPORTS_DIR / folder_name).resolve()
    try:
        folder.relative_to(EXPORTS_DIR.resolve())
    except ValueError as exc:
        raise AppError("Invalid export folder.", code="INVALID_EXPORT_FOLDER") from exc
    if not folder.is_dir():
        raise AppError(
            "That export folder no longer exists.",
            code="EXPORT_NOT_FOUND",
            status_code=404,
        )
    return folder


def open_export_folder(folder_name: str) -> None:
    folder = export_folder(folder_name)
    try:
        if os.name == "nt":
            os.startfile(str(folder))  # type: ignore[attr-defined]
        elif sys_platform_is_mac():
            subprocess.Popen(["open", str(folder)], **_no_window_kwargs())
        else:
            subprocess.Popen(["xdg-open", str(folder)], **_no_window_kwargs())
    except OSError as exc:
        raise AppError(
            "The export folder could not be opened.",
            code="OPEN_FOLDER_FAILED",
            status_code=500,
        ) from exc


def sys_platform_is_mac() -> bool:
    import sys

    return sys.platform == "darwin"


__all__ = ["export_project_job", "export_folder", "open_export_folder"]

