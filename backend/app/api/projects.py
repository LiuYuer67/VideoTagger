from __future__ import annotations

from fastapi import APIRouter, Query

from ..core.errors import AppError
from ..core.jobs import jobs
from ..models import Project
from ..services.export_service import export_project_job
from ..services.project_service import (
    delete_project,
    import_project,
    list_projects,
    load_project,
    project_envelope,
    save_project,
)
from ..services.tag_service import add_tags


def _register_project_tags(project: Project) -> None:
    tags = [tag for annotation in project.annotations for tag in annotation.tags]
    if tags:
        add_tags(tags)


router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("")
def get_projects() -> list[dict]:
    return [item.model_dump(mode="json") for item in list_projects()]


@router.post("", status_code=201)
def create_project(project: Project, overwrite: bool = Query(default=False)) -> dict:
    saved = save_project(project, overwrite=overwrite)
    _register_project_tags(saved)
    return saved.model_dump(mode="json")


@router.post("/import", status_code=201)
def import_project_file(project: Project) -> dict:
    saved = import_project(project)
    _register_project_tags(saved)
    return saved.model_dump(mode="json")


@router.get("/{project_id}")
def get_project(project_id: str) -> dict:
    project = load_project(project_id)
    envelope = project_envelope(project)
    return {
        "project": envelope["project"].model_dump(mode="json"),
        "video_available": envelope["video_available"],
    }


@router.put("/{project_id}")
def update_project(project_id: str, project: Project) -> dict:
    if project.project_id != project_id:
        raise AppError(
            "The project identifier in the URL does not match the project data.",
            code="PROJECT_ID_MISMATCH",
            status_code=422,
        )
    saved = save_project(project, overwrite=True)
    _register_project_tags(saved)
    return saved.model_dump(mode="json")


@router.delete("/{project_id}", status_code=204)
def remove_project(project_id: str) -> None:
    delete_project(project_id)


@router.post("/{project_id}/export", status_code=202)
def start_export(project_id: str) -> dict:
    # Confirm the project exists before creating an asynchronous job.
    load_project(project_id)

    def target(job):
        return export_project_job(project_id, job)

    job = jobs.start("export", target)
    return {"job_id": job.id}
