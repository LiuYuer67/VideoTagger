from __future__ import annotations

import json
import logging
import os
import re
import uuid
from pathlib import Path

from pydantic import ValidationError

from ..config import PROJECTS_DIR
from ..core.errors import AppError
from ..models import Project, ProjectSummary, utc_now
from .video_service import get_cached_video

logger = logging.getLogger("videotagger")

_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,80}$")


def _project_path(project_id: str) -> Path:
    if not _ID_PATTERN.match(project_id):
        raise AppError("Invalid project identifier.", code="INVALID_PROJECT_ID")
    return PROJECTS_DIR / f"{project_id}.json"


def _write_atomic(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(f".json.{uuid.uuid4().hex[:8]}.tmp")
    tmp.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    os.replace(tmp, path)


def project_exists(project_id: str) -> bool:
    try:
        return _project_path(project_id).is_file()
    except AppError:
        return False


def save_project(project: Project, *, overwrite: bool = True) -> Project:
    path = _project_path(project.project_id)
    exists = path.is_file()
    if exists and not overwrite:
        raise AppError(
            "A project with this identifier already exists.",
            code="PROJECT_EXISTS",
            status_code=409,
        )
    now = utc_now()
    existing_created = None
    if exists:
        try:
            existing = Project.model_validate_json(path.read_text(encoding="utf-8"))
            existing_created = existing.created_at
        except (OSError, ValueError, ValidationError):
            existing_created = None
    project.created_at = existing_created or project.created_at or now
    project.updated_at = now
    try:
        _write_atomic(path, project.model_dump(mode="json"))
    except OSError as exc:
        logger.exception("Could not save project %s", project.project_id)
        raise AppError(
            "The project could not be saved. Check that the data folder is writable and has free space.",
            code="SAVE_FAILED",
            status_code=507,
        ) from exc
    return project


def load_project(project_id: str) -> Project:
    path = _project_path(project_id)
    if not path.is_file():
        raise AppError("Project not found.", code="PROJECT_NOT_FOUND", status_code=404)
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise AppError(
            "The project file could not be read.", code="PROJECT_READ_FAILED", status_code=500
        ) from exc
    try:
        return Project.model_validate_json(raw)
    except ValidationError as exc:
        logger.warning("Invalid project %s: %s", project_id, exc.errors())
        raise AppError(
            "This project file is invalid or uses an unsupported format.",
            code="INVALID_PROJECT",
            status_code=422,
        ) from exc
    except ValueError as exc:
        raise AppError(
            "This project file is not valid JSON.",
            code="INVALID_PROJECT",
            status_code=422,
        ) from exc


def delete_project(project_id: str) -> None:
    path = _project_path(project_id)
    if not path.is_file():
        raise AppError("Project not found.", code="PROJECT_NOT_FOUND", status_code=404)
    try:
        path.unlink()
    except OSError as exc:
        raise AppError(
            "The project could not be deleted.", code="DELETE_FAILED", status_code=500
        ) from exc


def import_project(project: Project) -> Project:
    if project_exists(project.project_id):
        project.project_id = uuid.uuid4().hex
        project.created_at = utc_now()
    project.updated_at = utc_now()
    return save_project(project, overwrite=True)


def list_projects() -> list[ProjectSummary]:
    summaries: list[ProjectSummary] = []
    for path in sorted(PROJECTS_DIR.glob("*.json")):
        if path.name.startswith("."):
            continue
        try:
            project = Project.model_validate_json(path.read_text(encoding="utf-8"))
        except (OSError, ValueError, ValidationError):
            logger.warning("Skipping unreadable project file %s", path.name)
            continue
        video_available = get_cached_video(project.video.video_id) is not None
        summaries.append(
            ProjectSummary(
                project_id=project.project_id,
                title=project.video.title or project.video.source_url or project.video.video_id,
                video_id=project.video.video_id,
                duration=project.video.duration,
                annotation_count=len(project.annotations),
                created_at=project.created_at,
                updated_at=project.updated_at,
                video_available=video_available,
            )
        )
    summaries.sort(key=lambda item: item.updated_at, reverse=True)
    return summaries


def project_envelope(project: Project) -> dict:
    return {
        "project": project,
        "video_available": get_cached_video(project.video.video_id) is not None,
    }
