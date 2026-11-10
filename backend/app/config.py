from __future__ import annotations

import os
import shutil
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.environ.get("VIDEOTAGGER_DATA_DIR", REPO_ROOT / "data")).resolve()
CACHE_DIR = DATA_DIR / "cache"
PROJECTS_DIR = DATA_DIR / "projects"
EXPORTS_DIR = DATA_DIR / "exports"
THUMBNAILS_DIR = DATA_DIR / "thumbnails"
LOGS_DIR = DATA_DIR / "logs"
TAGS_FILE = DATA_DIR / "tags.json"
FRONTEND_DIST = REPO_ROOT / "frontend" / "dist"

APP_NAME = "VideoTagger"
APP_VERSION = "1.0.0"
MAX_DOWNLOAD_BYTES = int(os.environ.get("VIDEOTAGGER_MAX_DOWNLOAD_BYTES", 8 * 1024**3))
DOWNLOAD_TIMEOUT_SECONDS = int(os.environ.get("VIDEOTAGGER_DOWNLOAD_TIMEOUT", 60 * 30))
FFMPEG_TIMEOUT_SECONDS = int(os.environ.get("VIDEOTAGGER_FFMPEG_TIMEOUT", 120))
MAX_ANNOTATIONS = 20_000

# Populated at startup and whenever the tools are requested.
FFMPEG_PATH: str | None = None
FFPROBE_PATH: str | None = None


def ensure_directories() -> None:
    for directory in (
        DATA_DIR,
        CACHE_DIR,
        PROJECTS_DIR,
        EXPORTS_DIR,
        THUMBNAILS_DIR,
        LOGS_DIR,
    ):
        directory.mkdir(parents=True, exist_ok=True)


def refresh_tool_paths() -> None:
    global FFMPEG_PATH, FFPROBE_PATH
    FFMPEG_PATH = os.environ.get("VIDEOTAGGER_FFMPEG") or shutil.which("ffmpeg")
    FFPROBE_PATH = os.environ.get("VIDEOTAGGER_FFPROBE") or shutil.which("ffprobe")


def ffmpeg_available() -> bool:
    if not FFMPEG_PATH:
        refresh_tool_paths()
    return bool(FFMPEG_PATH and Path(FFMPEG_PATH).is_file())


def ffprobe_available() -> bool:
    if not FFPROBE_PATH:
        refresh_tool_paths()
    return bool(FFPROBE_PATH and Path(FFPROBE_PATH).is_file())


def ffmpeg_dir() -> str | None:
    if not ffmpeg_available() or not FFMPEG_PATH:
        return None
    return str(Path(FFMPEG_PATH).parent)


def yt_dlp_available() -> bool:
    try:
        import yt_dlp  # noqa: F401
    except Exception:
        return bool(shutil.which("yt-dlp"))
    return True
