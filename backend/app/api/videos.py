from __future__ import annotations

import logging
import mimetypes
import re

from fastapi import APIRouter, Header, Query, Request, Response
from fastapi.responses import FileResponse, StreamingResponse

from ..core.errors import AppError
from ..core.jobs import jobs
from ..models import LoadVideoRequest
from ..services.video_service import (
    cached_video_info,
    extract_frame,
    load_video_job,
    parse_youtube_url,
    video_file_for,
)

logger = logging.getLogger("videotagger")
router = APIRouter(prefix="/api/videos", tags=["videos"])

_THUMB_RE = re.compile(r"^thumb_\d{4}\.jpg$")
_RANGE_RE = re.compile(r"^bytes=(\d*)-(\d*)$")


@router.post("/load", status_code=202)
def start_load(request: LoadVideoRequest) -> dict:
    video_id, _canonical = parse_youtube_url(request.url)

    def target(job):
        return load_video_job(request.url, job)

    job = jobs.start("video-load", target)
    return {"job_id": job.id, "video_id": video_id}


@router.get("/jobs/{job_id}")
def get_load_job(job_id: str) -> dict:
    job = jobs.get(job_id)
    if not job:
        raise AppError("That loading job was not found.", code="JOB_NOT_FOUND", status_code=404)
    return job.to_dict()


@router.get("/{video_id}")
def get_video(video_id: str) -> dict:
    if not re.match(r"^[A-Za-z0-9_-]{1,64}$", video_id):
        raise AppError("Invalid video identifier.", code="INVALID_VIDEO_ID")
    return cached_video_info(video_id, ensure_thumbs=True)


@router.api_route("/{video_id}/stream", methods=["GET", "HEAD"])
def stream_video(
    video_id: str,
    request: Request,
    range_header: str | None = Header(default=None, alias="Range"),
):
    path = video_file_for(video_id)
    try:
        total = path.stat().st_size
    except OSError as exc:
        raise AppError(
            "The cached video is unavailable.", code="VIDEO_MISSING", status_code=404
        ) from exc
    if total <= 0:
        raise AppError("The cached video is empty.", code="BAD_VIDEO", status_code=422)

    media_type = mimetypes.guess_type(path.name)[0] or "video/mp4"
    base_headers = {
        "Accept-Ranges": "bytes",
        "Content-Disposition": f'inline; filename="{path.name}"',
        "Cache-Control": "no-cache",
    }

    if not range_header:
        headers = {**base_headers, "Content-Length": str(total)}
        if request.method == "HEAD":
            return Response(status_code=200, media_type=media_type, headers=headers)

        def full_stream():
            with path.open("rb") as handle:
                while chunk := handle.read(1024 * 256):
                    yield chunk

        return StreamingResponse(full_stream(), media_type=media_type, headers=headers)

    match = _RANGE_RE.match(range_header.strip())
    if not match:
        return Response(
            status_code=416,
            headers={"Content-Range": f"bytes */{total}", **base_headers},
        )
    start_text, end_text = match.groups()
    if not start_text and not end_text:
        return Response(
            status_code=416,
            headers={"Content-Range": f"bytes */{total}", **base_headers},
        )
    if start_text:
        start = int(start_text)
        end = int(end_text) if end_text else total - 1
    else:
        suffix_length = int(end_text)
        if suffix_length <= 0:
            return Response(
                status_code=416,
                headers={"Content-Range": f"bytes */{total}", **base_headers},
            )
        start = max(0, total - suffix_length)
        end = total - 1
    if start >= total or start > end:
        return Response(
            status_code=416,
            headers={"Content-Range": f"bytes */{total}", **base_headers},
        )
    end = min(end, total - 1)
    length = end - start + 1
    headers = {
        **base_headers,
        "Content-Range": f"bytes {start}-{end}/{total}",
        "Content-Length": str(length),
    }
    if request.method == "HEAD":
        return Response(status_code=206, media_type=media_type, headers=headers)

    def range_stream():
        remaining = length
        with path.open("rb") as handle:
            handle.seek(start)
            while remaining > 0:
                chunk = handle.read(min(1024 * 256, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    return StreamingResponse(
        range_stream(), status_code=206, media_type=media_type, headers=headers
    )


@router.get("/{video_id}/thumbnail/{filename}")
def get_thumbnail(video_id: str, filename: str):
    if not re.match(r"^[A-Za-z0-9_-]{1,64}$", video_id) or not _THUMB_RE.match(filename):
        raise AppError("Invalid thumbnail request.", code="INVALID_THUMBNAIL")
    from ..config import THUMBNAILS_DIR

    path = (THUMBNAILS_DIR / video_id / filename).resolve()
    try:
        path.relative_to(THUMBNAILS_DIR.resolve())
    except ValueError as exc:
        raise AppError("Invalid thumbnail request.", code="INVALID_THUMBNAIL") from exc
    if not path.is_file():
        raise AppError(
            "That thumbnail does not exist.", code="THUMBNAIL_NOT_FOUND", status_code=404
        )
    return FileResponse(
        path,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400, immutable"},
    )


@router.get("/{video_id}/frame")
def get_frame(
    video_id: str,
    time: float = Query(default=0.0, ge=0.0),
):
    content = extract_frame(video_id, time)
    return Response(
        content=content,
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store"},
    )
