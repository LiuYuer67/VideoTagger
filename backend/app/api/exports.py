from __future__ import annotations

from fastapi import APIRouter, Response

from ..core.errors import AppError
from ..core.jobs import jobs
from ..models import OpenExportRequest
from ..services.export_service import open_export_folder

router = APIRouter(prefix="/api/exports", tags=["exports"])


@router.get("/jobs/{job_id}")
def get_export_job(job_id: str) -> dict:
    job = jobs.get(job_id)
    if not job or job.kind != "export":
        raise AppError("That export job was not found.", code="JOB_NOT_FOUND", status_code=404)
    return job.to_dict()


@router.post("/open", status_code=204)
def open_folder(request: OpenExportRequest) -> Response:
    open_export_folder(request.folder_name)
    return Response(status_code=204)
