# VideoTagger — Video Tagging Studio

A fast, local-first desktop application for turning videoes into cropped, tagged image datasets.

Load a YouTube video, move through video timeilne, draw one or more crop regions on any frame, assign comma-separated tags with autocomplete, save portable project files, and export numbered PNG/TXT pairs. Built with React, TypeScript, FastAPI, FFmpeg, and yt-dlp.

Fully vibe coded. Shared open tool.

![Example](./GitImages/Example%20frame%20tagging.png)

---

## Features

- **YouTube loading** — URL validation, stable video-ID caching, yt-dlp downloads, and download progress.
- **Local cache** — videos are downloaded once and reused. Corrupt caches are moved aside instead of being silently reused.
- **Filmstrip timeline** — video timeline showing frame previews, zoom with `Ctrl` + wheel, drag-pan, click-to-seek, draggable playhead, and one cyan marker per tagged frame.
- **Frame-accurate navigation** — previous/next frame, previous/next tagged frame, start/end, and play/pause.
- **Bounding boxes** — draw, select, move, resize, and delete multiple normalized regions per frame. Boxes stay aligned through resizes and letterboxing. Optional **Use last tags** inheritance fills each new box with the tags from the nearest tagged region.
- **Tagging** — chips, comma/Enter entry, duplicate prevention, case-insensitive global dictionary, prefix-first autocomplete, `Tab` acceptance, and inline chip editing.
- **Full tag library** — a searchable cloud of tag buttons for every saved tag, ordered by how many regions in the project use it.
- **Portable projects** — JSON project files with schema/version validation, local draft autosave, recovery prompts, import/export, and missing-video re-download.
- **Accurate export** — every annotation becomes a full-resolution PNG crop plus a UTF-8 comma-separated TXT file, numbered from `1`. Frame extraction and cropping are done with FFmpeg.
- **Progress and reliability** — long-running downloads and exports run in background jobs with progress reporting and clear error messages. Partial exports are removed if anything fails.

---

## Requirements

| Tool | Version |
|---|---|
| Node.js | 18 or newer |
| Python | 3.11+ |
| FFmpeg / FFprobe | Any recent build on `PATH` |
| yt-dlp | Installed into the project virtualenv by setup |

FFmpeg is required for metadata probing, thumbnails, frame extraction, and export. yt-dlp is required for YouTube downloads. An internet connection is only needed to download videos.

---

## Quick start

```bash
npm run setup
npm run dev
```

Then open **http://127.0.0.1:5173**.

`npm run setup` will:

1. Create `.venv` if needed.
2. Install `backend/requirements.txt` (FastAPI, Uvicorn, yt-dlp).
3. Install the frontend dependencies in `frontend/`.

If FFmpeg is not on `PATH`, set `VIDEOTAGGER_FFMPEG` and `VIDEOTAGGER_FFPROBE` before starting the backend.

### Production-style start

```bash
npm run build
npm start
```

Open **http://127.0.0.1:8000**. FastAPI serves the built frontend and the API from one process.

### Manual setup

```powershell
# Windows
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
npm install --prefix frontend
npm run dev
```

```bash
# macOS / Linux
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
npm install --prefix frontend
npm run dev
```

---

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Space` | Play / pause |
| `←` / `→` | Previous / next frame |
| `Shift` + `←` / `→` | Jump 10 frames |
| `[` / `]` | Previous / next tagged frame |
| `Home` / `End` | Start / end of video |
| `Ctrl` + wheel | Zoom timeline under cursor |
| `Delete` | Delete selected region |
| `Escape` | Cancel drawing / deselect (in tag input: close suggestions, then release focus) |
| `Tab` | Accept the highlighted tag suggestion |
| `Enter` | Add typed tag, or accept a suggestion after arrow-key navigation |
| `Ctrl` + `S` | Save project |
| `Ctrl` + `E` | Open export |
| `Ctrl` + `O` | Open project browser |
| `?` | Keyboard shortcut reference |

Keyboard shortcuts are suppressed while typing in an input, except for project-level shortcuts such as `Ctrl` + `S`.

---

## Data layout

```text
data/
├── cache/          # downloaded videos + <video-id>.meta.json
├── thumbnails/     # cached filmstrip JPEGs per video
├── projects/       # portable project JSON files
├── exports/        # exported PNG/TXT folders
├── logs/           # backend log files
└── tags.json       # global tag dictionary
```

The data directory can be moved with `VIDEOTAGGER_DATA_DIR`. It is the only state the application owns; back it up to keep your projects and videos.

### Project format

```json
{
  "version": 1,
  "project_id": "unique-project-id",
  "video": {
    "source_url": "https://www.youtube.com/watch?v=example",
    "video_id": "example",
    "filename": "example.mp4",
    "title": "Example",
    "duration": 120.5,
    "width": 1920,
    "height": 1080,
    "fps": 30
  },
  "annotations": [
    {
      "id": "ann-1",
      "timestamp": 12.5,
      "frame_index": 375,
      "bbox": { "x": 0.1, "y": 0.2, "width": 0.3, "height": 0.4 },
      "tags": ["person", "outdoor", "walking"]
    }
  ],
  "created_at": "2026-01-01T12:00:00Z",
  "updated_at": "2026-01-01T12:05:00Z"
}
```

Bounding boxes are always normalized to the displayed video content, not the player container. Multiple annotations may share a timestamp. Exports sort by `(timestamp, frame_index, id)`.

### Export format

```text
data/exports/<title>_export_<timestamp>/
├── 1.png
├── 1.txt
├── 2.png
├── 2.txt
└── ...
```

- PNG files are cropped at source resolution.
- TXT files contain only the comma-separated tags in their original order, encoded as UTF-8.
- Untagged regions still produce an empty TXT file.
- A failed export leaves no partial folder behind.

## Architecture

```text
frontend/                 React + TypeScript + Vite + Tailwind + Zustand
backend/app/
├── api/                  FastAPI routers (videos, projects, tags, exports)
├── core/                 errors, background jobs
├── services/             video/cache, thumbnails, projects, tags, export
├── config.py             paths and runtime settings
├── models.py             Pydantic schemas
└── main.py               app, logging, static frontend serving
scripts/                  setup/dev/start launchers
data/                     local cache, projects, exports, thumbnails
```

### Backend API

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/videos/load` | Start a video load/download job |
| `GET` | `/api/videos/jobs/{job_id}` | Poll video-load progress |
| `GET` | `/api/videos/{id}` | Video metadata + thumbnail index |
| `GET` | `/api/videos/{id}/stream` | Range-enabled video stream |
| `GET` | `/api/videos/{id}/thumbnail/{file}` | Cached thumbnail |
| `GET` | `/api/videos/{id}/frame?time=` | JPEG frame at a timestamp |
| `GET` | `/api/projects` | List saved projects |
| `POST` | `/api/projects` | Create a project |
| `POST` | `/api/projects/import` | Import project JSON |
| `GET` | `/api/projects/{id}` | Load a project |
| `PUT` | `/api/projects/{id}` | Update a project |
| `DELETE` | `/api/projects/{id}` | Delete a project (keeps cached video) |
| `POST` | `/api/projects/{id}/export` | Start an export job |
| `GET` | `/api/exports/jobs/{job_id}` | Poll export progress |
| `POST` | `/api/exports/open` | Open an export folder locally |
| `GET` | `/api/tags` | Global tag dictionary |
| `POST` | `/api/tags` | Add tags to the dictionary |
| `GET` | `/api/health` | Tool and service status |

Interactive OpenAPI docs are available at **http://127.0.0.1:8000/api/docs**.

### Configuration

| Environment variable | Default | Description |
|---|---|---|
| `VIDEOTAGGER_DATA_DIR` | `./data` | Data root |
| `VIDEOTAGGER_FFMPEG` | `ffmpeg` on PATH | FFmpeg executable |
| `VIDEOTAGGER_FFPROBE` | `ffprobe` on PATH | FFprobe executable |
| `VIDEOTAGGER_MAX_DOWNLOAD_BYTES` | `8589934592` (8 GiB) | Download size cap |
| `VIDEOTAGGER_DOWNLOAD_TIMEOUT` | `1800` | Download timeout (seconds) |
| `VIDEOTAGGER_FFMPEG_TIMEOUT` | `120` | Per-frame FFmpeg timeout (seconds) |
| `PORT` / `HOST` | `8000` / `127.0.0.1` | Production server binding |

## Troubleshooting

**“FFmpeg is not installed…”**  
Install FFmpeg, make sure both `ffmpeg` and `ffprobe` are on `PATH`, then restart the backend. Alternatively set `VIDEOTAGGER_FFMPEG` / `VIDEOTAGGER_FFPROBE` to absolute paths.

**YouTube download fails**  
YouTube sometimes requires sign-in verification or blocks requests from a network. Try another public video. Ensure `yt-dlp` is up to date: `.venv/Scripts/python.exe -m pip install -U yt-dlp` (Windows) or `.venv/bin/python -m pip install -U yt-dlp`.

**The video is cached but the project says it is missing**  
The source file was moved or deleted from `data/cache`. Open the project and use the “Download video” action to restore it; annotations are preserved.

**Reset local data**  
Stop the server, back up anything you need from `data/`, and remove `data/cache`, `data/thumbnails`, `data/projects`, `data/exports`, and `data/tags.json`. The backend recreates the directories on startup.

