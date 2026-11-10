from __future__ import annotations

import json
import logging
import threading
from datetime import datetime, timezone

from ..config import TAGS_FILE
from ..core.errors import AppError

logger = logging.getLogger("videotagger")

_lock = threading.Lock()
_cache: list[str] | None = None


def _normalize(values: list[str]) -> list[str]:
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


def _load() -> list[str]:
    global _cache
    if _cache is not None:
        return _cache
    if not TAGS_FILE.is_file():
        _cache = []
        return _cache
    try:
        payload = json.loads(TAGS_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        logger.warning("Could not read tag dictionary; starting a new one")
        _cache = []
        return _cache
    tags = payload.get("tags") if isinstance(payload, dict) else payload
    if not isinstance(tags, list):
        tags = []
    _cache = _normalize([str(item) for item in tags])
    return _cache


def get_tags() -> list[str]:
    with _lock:
        return list(_load())


def add_tags(values: list[str]) -> list[str]:
    global _cache
    incoming = _normalize(values)
    if not incoming:
        return get_tags()
    with _lock:
        current = _load()
        seen = {tag.casefold() for tag in current}
        changed = False
        for tag in incoming:
            if tag.casefold() not in seen:
                current.append(tag)
                seen.add(tag.casefold())
                changed = True
        if changed:
            TAGS_FILE.parent.mkdir(parents=True, exist_ok=True)
            payload = {
                "tags": current,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            tmp = TAGS_FILE.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
            tmp.replace(TAGS_FILE)
        _cache = current
        return list(current)


def ensure_writable() -> None:
    try:
        TAGS_FILE.parent.mkdir(parents=True, exist_ok=True)
        test = TAGS_FILE.parent / ".write-test"
        test.write_text("ok", encoding="utf-8")
        test.unlink()
    except OSError as exc:
        raise AppError(
            "The data directory is not writable.", code="STORAGE_UNAVAILABLE", status_code=507
        ) from exc
