from __future__ import annotations

import logging
import logging.handlers
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .api import exports, projects, tags, videos
from .config import (
    APP_NAME,
    APP_VERSION,
    FRONTEND_DIST,
    LOGS_DIR,
    ensure_directories,
    ffmpeg_available,
    ffprobe_available,
    refresh_tool_paths,
    yt_dlp_available,
)
from .core.errors import install_error_handlers

logger = logging.getLogger("videotagger")


def configure_logging() -> None:
    ensure_directories()
    logger.setLevel(logging.INFO)
    if logger.handlers:
        return
    formatter = logging.Formatter(
        "%(asctime)s %(levelname)-7s %(name)s | %(message)s", "%Y-%m-%d %H:%M:%S"
    )
    console = logging.StreamHandler()
    console.setFormatter(formatter)
    logger.addHandler(console)
    try:
        file_handler = logging.handlers.RotatingFileHandler(
            LOGS_DIR / "videotagger.log",
            maxBytes=2_000_000,
            backupCount=3,
            encoding="utf-8",
        )
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    except OSError:
        logger.warning("Could not open the log file; logging to the console only")
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    configure_logging()
    refresh_tool_paths()
    ensure_directories()
    logger.info("%s %s starting", APP_NAME, APP_VERSION)
    logger.info(
        "Tools - ffmpeg: %s | ffprobe: %s | yt-dlp: %s",
        "ok" if ffmpeg_available() else "MISSING",
        "ok" if ffprobe_available() else "MISSING",
        "ok" if yt_dlp_available() else "MISSING",
    )
    yield
    logger.info("%s stopping", APP_NAME)


app = FastAPI(
    title=f"{APP_NAME} API",
    version=APP_VERSION,
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "Content-Range",
        "Accept-Ranges",
        "Content-Length",
        "Content-Type",
    ],
)

install_error_handlers(app)
app.include_router(videos.router)
app.include_router(projects.router)
app.include_router(tags.router)
app.include_router(exports.router)


@app.get("/api/health")
def health() -> dict:
    refresh_tool_paths()
    return {
        "name": APP_NAME,
        "version": APP_VERSION,
        "status": "ok",
        "ffmpeg": ffmpeg_available(),
        "ffprobe": ffprobe_available(),
        "ytdlp": yt_dlp_available(),
        "frontend_built": (FRONTEND_DIST / "index.html").is_file(),
    }


# Serve the production bundle when it exists. During development Vite serves the
# frontend and proxies /api to this process.
if FRONTEND_DIST.is_dir():
    assets = FRONTEND_DIST / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    candidate = FRONTEND_DIST / "favicon.svg"
    if candidate.is_file():
        return FileResponse(candidate)
    return JSONResponse(status_code=404, content={"detail": "Not found"})


@app.get("/{full_path:path}", include_in_schema=False)
def serve_frontend(full_path: str, request: Request):
    if full_path.startswith("api/") or full_path == "api":
        return JSONResponse(
            status_code=404,
            content={"detail": "API endpoint not found.", "code": "NOT_FOUND"},
        )
    if full_path:
        candidate = (FRONTEND_DIST / full_path).resolve()
        try:
            candidate.relative_to(FRONTEND_DIST.resolve())
        except ValueError:
            candidate = Path()
        if candidate.is_file():
            return FileResponse(candidate)
    index = FRONTEND_DIST / "index.html"
    if index.is_file():
        return FileResponse(index)
    return JSONResponse(
        status_code=503,
        content={
            "detail": "The frontend has not been built. Run `npm run build` in the project root.",
            "code": "FRONTEND_NOT_BUILT",
        },
    )
