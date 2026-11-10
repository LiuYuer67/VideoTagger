import type {
  ExportResult,
  HealthInfo,
  Job,
  Project,
  ProjectEnvelope,
  ProjectSummary,
  VideoInfo,
  VideoLoadResult,
} from '../types'

export class ApiError extends Error {
  code: string
  status: number

  constructor(message: string, code = 'ERROR', status = 0) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(
      'Cannot reach the VideoTagger backend. Is the local server running?',
      'NETWORK_ERROR',
    )
  }

  if (!response.ok) {
    let message = `Request failed (${response.status}).`
    let code = 'HTTP_ERROR'
    try {
      const payload = await response.json()
      if (typeof payload?.detail === 'string') message = payload.detail
      if (typeof payload?.code === 'string') code = payload.code
    } catch {
      // Keep the generic message for non-JSON error pages.
    }
    throw new ApiError(message, code, response.status)
  }

  if (response.status === 204) return undefined as T
  try {
    return (await response.json()) as T
  } catch {
    throw new ApiError('The server returned an unreadable response.', 'BAD_RESPONSE')
  }
}

export const api = {
  health: () => request<HealthInfo>('/api/health'),

  getTags: () => request<{ tags: string[] }>('/api/tags'),
  addTags: (tags: string[]) =>
    request<{ tags: string[] }>('/api/tags', {
      method: 'POST',
      body: JSON.stringify({ tags }),
    }),

  startVideoLoad: (url: string) =>
    request<{ job_id: string; video_id: string }>('/api/videos/load', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),
  getVideoJob: (jobId: string) =>
    request<Job<VideoLoadResult>>(`/api/videos/jobs/${jobId}`),
  getVideo: (videoId: string) => request<VideoInfo>(`/api/videos/${videoId}`),

  listProjects: () => request<ProjectSummary[]>('/api/projects'),
  getProject: (projectId: string) =>
    request<ProjectEnvelope>(`/api/projects/${projectId}`),
  createProject: (project: Project) =>
    request<Project>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(project),
    }),
  updateProject: (project: Project) =>
    request<Project>(`/api/projects/${project.project_id}`, {
      method: 'PUT',
      body: JSON.stringify(project),
    }),
  importProject: (project: Project) =>
    request<Project>('/api/projects/import', {
      method: 'POST',
      body: JSON.stringify(project),
    }),
  deleteProject: (projectId: string) =>
    request<void>(`/api/projects/${projectId}`, { method: 'DELETE' }),

  startExport: (projectId: string) =>
    request<{ job_id: string }>(`/api/projects/${projectId}/export`, {
      method: 'POST',
    }),
  getExportJob: (jobId: string) =>
    request<Job<ExportResult>>(`/api/exports/jobs/${jobId}`),
  openExportFolder: (folderName: string) =>
    request<void>('/api/exports/open', {
      method: 'POST',
      body: JSON.stringify({ folder_name: folderName }),
    }),
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = window.setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

export type JobKind = 'video' | 'export'

export async function watchJob<T>(
  kind: JobKind,
  jobId: string,
  onUpdate: (job: Job<T>) => void,
  signal?: AbortSignal,
): Promise<Job<T>> {
  for (let attempt = 0; attempt < 7200; attempt += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const job =
      kind === 'video'
        ? ((await api.getVideoJob(jobId)) as Job<T>)
        : ((await api.getExportJob(jobId)) as Job<T>)
    onUpdate(job)
    if (job.status === 'success') return job
    if (job.status === 'error') {
      throw new ApiError(job.error || 'The operation failed.', job.error_code || 'JOB_FAILED')
    }
    await sleep(job.phase === 'download' ? 650 : 450, signal)
  }
  throw new ApiError('The operation timed out.', 'JOB_TIMEOUT')
}

export function streamUrl(videoId: string): string {
  return `/api/videos/${videoId}/stream`
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'An unexpected error occurred.'
}
