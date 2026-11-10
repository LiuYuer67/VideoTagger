from __future__ import annotations

from fastapi import APIRouter

from ..models import AddTagsRequest
from ..services.tag_service import add_tags, get_tags

router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.get("")
def list_tags() -> dict:
    return {"tags": get_tags()}


@router.post("")
def create_tags(request: AddTagsRequest) -> dict:
    return {"tags": add_tags(request.tags)}
