from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .config import MAX_ANNOTATIONS


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="ignore")


class BoundingBox(ApiModel):
    x: float = Field(ge=0.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)
    width: float = Field(gt=0.0, le=1.0)
    height: float = Field(gt=0.0, le=1.0)

    @model_validator(mode="after")
    def validate_bounds(self) -> "BoundingBox":
        if self.x + self.width > 1.000001:
            raise ValueError("Bounding box extends beyond the right edge")
        if self.y + self.height > 1.000001:
            raise ValueError("Bounding box extends beyond the bottom edge")
        return self


class VideoRef(ApiModel):
    source_url: str = Field(min_length=1, max_length=2048)
    video_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,64}$")
    filename: str = Field(min_length=1, max_length=255)
    title: str = Field(default="", max_length=500)
    duration: float = Field(gt=0)
    width: int = Field(gt=0, le=32768)
    height: int = Field(gt=0, le=32768)
    fps: float = Field(gt=0, le=1000)

    @field_validator("filename")
    @classmethod
    def filename_must_be_plain(cls, value: str) -> str:
        value = value.strip()
        if "/" in value or "\\" in value or value in {".", ".."}:
            raise ValueError("Invalid video filename")
        return value

    @field_validator("fps")
    @classmethod
    def sane_fps(cls, value: float) -> float:
        if not math.isfinite(value) or value <= 0:
            raise ValueError("Invalid frame rate")
        return value


class Annotation(ApiModel):
    id: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_.:-]+$")
    timestamp: float = Field(ge=0)
    frame_index: int = Field(ge=0)
    bbox: BoundingBox
    tags: list[str] = Field(default_factory=list, max_length=60)

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, values: list[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for raw in values:
            tag = " ".join(str(raw).replace(",", " ").split()).strip()
            if not tag:
                continue
            if len(tag) > 100:
                tag = tag[:100].rstrip()
            key = tag.casefold()
            if key in seen:
                continue
            seen.add(key)
            normalized.append(tag)
        return normalized


class Project(ApiModel):
    version: Literal[1]
    project_id: str = Field(
        min_length=1, max_length=80, pattern=r"^[A-Za-z0-9_-]+$"
    )
    video: VideoRef
    annotations: list[Annotation] = Field(
        default_factory=list, max_length=MAX_ANNOTATIONS
    )
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    @model_validator(mode="after")
    def validate_annotations(self) -> "Project":
        seen: set[str] = set()
        for annotation in self.annotations:
            if annotation.id in seen:
                raise ValueError(f"Duplicate annotation id: {annotation.id}")
            seen.add(annotation.id)
            if annotation.timestamp > self.video.duration + 0.05:
                raise ValueError(
                    f"Annotation {annotation.id} is past the end of the video"
                )
            max_frame = math.ceil(self.video.duration * self.video.fps) + 1
            if annotation.frame_index > max_frame:
                raise ValueError(
                    f"Annotation {annotation.id} points past the end of the video"
                )
        return self


class TagDictionary(ApiModel):
    tags: list[str] = Field(default_factory=list, max_length=5000)


class AddTagsRequest(ApiModel):
    tags: list[str] = Field(default_factory=list, max_length=5000)

    @field_validator("tags")
    @classmethod
    def normalize(cls, values: list[str]) -> list[str]:
        result: list[str] = []
        seen: set[str] = set()
        for raw in values:
            tag = " ".join(str(raw).replace(",", " ").split()).strip()
            if not tag:
                continue
            tag = tag[:100].rstrip()
            key = tag.casefold()
            if key not in seen:
                seen.add(key)
                result.append(tag)
        return result


class LoadVideoRequest(ApiModel):
    url: str = Field(min_length=0, max_length=2048)


class OpenExportRequest(ApiModel):
    folder_name: str = Field(min_length=1, max_length=200)


class VideoInfo(ApiModel):
    video_id: str
    source_url: str
    filename: str
    title: str
    duration: float
    width: int
    height: int
    fps: float
    size: int = 0
    codec: str = ""
    available: bool = True
    stream_url: str
    thumbnail_count: int = 0
    thumbnails: list[dict] = Field(default_factory=list)


class ProjectEnvelope(ApiModel):
    project: Project
    video_available: bool


class ProjectSummary(ApiModel):
    project_id: str
    title: str
    video_id: str
    duration: float
    annotation_count: int
    created_at: datetime
    updated_at: datetime
    video_available: bool
