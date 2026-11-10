export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface Annotation {
  id: string
  timestamp: number
  frame_index: number
  bbox: BoundingBox
  tags: string[]
}

export interface VideoRef {
  source_url: string
  video_id: string
  filename: string
  title: string
  duration: number
  width: number
  height: number
  fps: number
}

export interface Project {
  version: 1
  project_id: string
  video: VideoRef
  annotations: Annotation[]
  created_at: string
  updated_at: string
}

export interface Thumbnail {
  index: number
  time: number
  url: string
}

export interface VideoInfo extends VideoRef {
  size: number
  codec: string
  available: boolean
  stream_url: string
  thumbnail_count: number
  thumbnails: Thumbnail[]
}

export interface ProjectEnvelope {
  project: Project
  video_available: boolean
}

export interface ProjectSummary {
  project_id: string
  title: string
  video_id: string
  duration: number
  annotation_count: number
  created_at: string
  updated_at: string
  video_available: boolean
}

export interface Job<T = unknown> {
  id: string
  kind: string
  status: 'queued' | 'running' | 'success' | 'error'
  phase: string
  progress: number
  message: string
  result: T | null
  error: string | null
  error_code: string | null
  created_at: string
  updated_at: string
}

export type VideoLoadResult = VideoInfo

export interface ExportResult {
  folder_name: string
  path: string
  image_count: number
  tag_file_count: number
  empty_tag_count: number
  total_bytes: number
  width: number
  height: number
}

export interface HealthInfo {
  name: string
  version: string
  status: string
  ffmpeg: boolean
  ffprobe: boolean
  ytdlp: boolean
  frontend_built: boolean
}

export interface DraftSnapshot {
  project: Project
  baseUpdatedAt: string
  currentFrame: number
  savedAt: number
}
