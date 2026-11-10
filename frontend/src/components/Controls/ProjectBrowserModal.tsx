import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Clock3,
  Download,
  FileJson,
  Film,
  FolderOpen,
  HardDrive,
  Loader2,
  Tags,
  Upload,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { ProgressBar } from '../ui/ProgressBar'
import { api, errorMessage, watchJob } from '../../services/api'
import { videoRefFromInfo } from '../../services/workspace'
import { toast } from '../../stores/toastStore'
import { useProjectStore } from '../../stores/projectStore'
import type {
  Job,
  Project,
  ProjectEnvelope,
  ProjectSummary,
  VideoInfo,
  VideoLoadResult,
} from '../../types'
import { formatClock, formatRelativeDate } from '../../utils/time'
import { cn } from '../../utils/cn'

interface ProjectBrowserModalProps {
  open: boolean
  onClose: () => void
  currentProjectId: string
  dirty: boolean
  onOpenProject: (project: Project, video: VideoInfo) => void
}

export function ProjectBrowserModal({
  open,
  onClose,
  currentProjectId,
  dirty,
  onOpenProject,
}: ProjectBrowserModalProps) {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [missing, setMissing] = useState<Project | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [jobProgress, setJobProgress] = useState<{ progress: number; message: string } | null>(
    null,
  )
  const importRef = useRef<HTMLInputElement>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const busy = Boolean(busyId) || Boolean(jobProgress)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setProjects(await api.listProjects())
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setMissing(null)
    setBusyId(null)
    setJobProgress(null)
    setError(null)
    void refresh()
    return () => {
      controllerRef.current?.abort()
    }
  }, [open, refresh])

  const confirmSwitch = (): boolean => {
    if (!dirty) return true
    return window.confirm(
      'This project has unsaved changes. A local draft will be kept, but the workspace will switch.\n\nContinue?',
    )
  }

  const openEnvelope = async (envelope: ProjectEnvelope) => {
    if (!envelope.video_available) {
      setMissing(envelope.project)
      return
    }
    try {
      const video = await api.getVideo(envelope.project.video.video_id)
      onOpenProject(envelope.project, video)
      onClose()
    } catch (caught) {
      setMissing(envelope.project)
      setError(errorMessage(caught))
    }
  }

  const handleOpen = async (summary: ProjectSummary) => {
    if (busy) return
    if (summary.project_id === currentProjectId) {
      onClose()
      return
    }
    if (!confirmSwitch()) return
    setBusyId(summary.project_id)
    setError(null)
    setMissing(null)
    try {
      const envelope = await api.getProject(summary.project_id)
      await openEnvelope(envelope)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusyId(null)
    }
  }

  const handleDownloadMissing = async () => {
    if (!missing || busy) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setError(null)
    setJobProgress({ progress: 0, message: 'Preparing video…' })
    try {
      const started = await api.startVideoLoad(missing.video.source_url)
      const job = await watchJob<VideoLoadResult>(
        'video',
        started.job_id,
        (update: Job<VideoLoadResult>) =>
          setJobProgress({ progress: update.progress, message: update.message }),
        controller.signal,
      )
      if (!job.result) throw new Error('The video could not be loaded.')
      const videoChanged = missing.video.video_id !== job.result.video_id
      const updatedProject: Project = {
        ...missing,
        video: videoRefFromInfo(job.result),
      }
      onOpenProject(updatedProject, job.result)
      onClose()
      if (videoChanged) {
        useProjectStore.getState().markDirty()
        toast.info(
          'Video restored',
          'Save the project to update its cached video reference.',
        )
      }
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      setError(errorMessage(caught))
    } finally {
      setJobProgress(null)
    }
  }

  const handleImport = async (file: File | null) => {
    if (!file || busy) return
    if (!confirmSwitch()) return
    setBusyId('import')
    setError(null)
    try {
      const data = JSON.parse(await file.text()) as Project
      const saved = await api.importProject(data)
      const envelope = await api.getProject(saved.project_id)
      await refresh()
      await openEnvelope(envelope)
      toast.success('Project imported', `${saved.annotations.length} regions restored.`)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusyId(null)
      if (importRef.current) importRef.current.value = ''
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeDisabled={busy}
      title={missing ? 'Video not cached' : 'Open project'}
      subtitle={
        missing
          ? missing.video.title || missing.video.video_id
          : 'Projects are stored as portable JSON files in your local data folder.'
      }
      size="md"
      footer={
        missing ? (
          <>
            <Button
              variant="quiet"
              onClick={() => {
                setMissing(null)
                setError(null)
              }}
              disabled={busy}
            >
              Back to projects
            </Button>
            <Button
              variant="primary"
              icon={<Download className="h-3.5 w-3.5" />}
              onClick={() => void handleDownloadMissing()}
              loading={Boolean(jobProgress)}
              disabled={busy}
            >
              Download source video
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="quiet"
              onClick={() => importRef.current?.click()}
              icon={<Upload className="h-3.5 w-3.5" />}
              disabled={busy}
            >
              Import JSON
            </Button>
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
          </>
        )
      }
    >
      {missing ? (
        <div className="space-y-4">
          <p className="text-[11.5px] leading-relaxed text-zinc-400">
            The project file is safe, but its source video is missing from the local cache.
            Download it again to restore this workspace.
          </p>
          <div className="rounded-lg border border-ink-700 bg-ink-900/60 p-3">
            <div className="label mb-1.5">Original source</div>
            <div className="break-all font-mono text-[10px] leading-relaxed text-zinc-500">
              {missing.video.source_url}
            </div>
          </div>
          {jobProgress && (
            <div className="rounded-lg border border-accent/20 bg-accent/[0.04] p-3">
              <div className="mb-2 flex items-center justify-between text-[10.5px] text-zinc-300">
                <span className="flex min-w-0 items-center gap-2">
                  <Loader2 className="h-3 w-3 shrink-0 animate-spin text-accent" />
                  <span className="truncate">{jobProgress.message}</span>
                </span>
                <span className="timecode shrink-0 text-accent">
                  {Math.round(jobProgress.progress)}%
                </span>
              </div>
              <ProgressBar value={jobProgress.progress} />
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.05] p-3 text-[10.5px] leading-relaxed text-red-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-[0.14em] text-zinc-600">
              {projects.length} saved project{projects.length === 1 ? '' : 's'}
            </span>
            <button
              onClick={() => void refresh()}
              className="inline-flex items-center gap-1 text-[9px] text-zinc-600 transition hover:text-zinc-300"
            >
              <Loader2 className={cn('h-2.5 w-2.5', loading && 'animate-spin')} />
              Refresh
            </button>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.05] p-2.5 text-[10.5px] leading-relaxed text-red-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          {loading && projects.length === 0 ? (
            <div className="space-y-2">
              {[0, 1, 2].map((index) => (
                <div key={index} className="h-[62px] animate-pulse rounded-lg bg-ink-800/60" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-dashed border-ink-650 px-6 py-10 text-center">
              <Film className="mb-3 h-5 w-5 text-zinc-600" />
              <div className="text-[11px] text-zinc-400">No projects saved yet</div>
              <div className="mt-1 text-[9.5px] text-zinc-600">
                Save this workspace, or import a project JSON file.
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {projects.map((project) => {
                const isCurrent = project.project_id === currentProjectId
                return (
                  <button
                    key={project.project_id}
                    onClick={() => void handleOpen(project)}
                    disabled={busy}
                    className={cn(
                      'group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-60',
                      isCurrent
                        ? 'border-accent/30 bg-accent/[0.045]'
                        : 'border-ink-700 bg-ink-900/35 hover:border-ink-600 hover:bg-ink-800/70',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded border',
                        isCurrent
                          ? 'border-accent/25 bg-accent/10 text-accent'
                          : 'border-ink-700 bg-ink-800 text-zinc-600',
                      )}
                    >
                      {busyId === project.project_id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FolderOpen className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[11.5px] font-medium text-zinc-200">
                          {project.title}
                        </span>
                        {isCurrent && (
                          <span className="shrink-0 rounded bg-accent/15 px-1 py-0.5 text-[7.5px] uppercase tracking-wider text-accent">
                            current
                          </span>
                        )}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[8.5px] text-zinc-600">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="h-2.5 w-2.5" />
                          {formatClock(project.duration)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Tags className="h-2.5 w-2.5" />
                          {project.annotation_count} regions
                        </span>
                        <span>{formatRelativeDate(project.updated_at)}</span>
                      </span>
                    </span>
                    <span className="shrink-0">
                      {project.video_available ? (
                        <span className="inline-flex items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/[0.05] px-1.5 py-0.5 text-[8px] text-emerald-400/80">
                          <HardDrive className="h-2.5 w-2.5" />
                          cached
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded border border-amber-500/20 bg-amber-500/[0.05] px-1.5 py-0.5 text-[8px] text-amber-400/80">
                          <Download className="h-2.5 w-2.5" />
                          missing
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          <div className="flex items-center gap-2 rounded-lg border border-ink-700/70 bg-ink-900/30 px-3 py-2 text-[9px] text-zinc-600">
            <FileJson className="h-3 w-3 shrink-0" />
            Project JSON files are portable. Import one from another machine to continue.
          </div>
        </div>
      )}

      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => void handleImport(event.target.files?.[0] ?? null)}
      />
    </Modal>
  )
}
