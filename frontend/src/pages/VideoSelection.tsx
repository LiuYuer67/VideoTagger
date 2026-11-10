import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  Check,
  Clock3,
  Download,
  FileJson,
  Film,
  FolderOpen,
  HardDrive,
  History,
  Link2,
  Loader2,
  Play,
  Scissors,
  Tags,
  Trash2,
  Upload,
  Youtube,
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Wordmark } from '../components/ui/Logo'
import { Modal } from '../components/ui/Modal'
import { ProgressBar } from '../components/ui/ProgressBar'
import { api, errorMessage, watchJob } from '../services/api'
import { clearLastProject, getLastProject, readDraftById, removeDraft } from '../services/drafts'
import {
  openDraftWorkspace,
  openNewWorkspace,
  openProjectWorkspace,
  videoRefFromInfo,
} from '../services/workspace'
import { toast } from '../stores/toastStore'
import { useProjectStore } from '../stores/projectStore'
import type {
  DraftSnapshot,
  HealthInfo,
  Job,
  Project,
  ProjectEnvelope,
  ProjectSummary,
  VideoInfo,
  VideoLoadResult,
} from '../types'
import { cn } from '../utils/cn'
import { formatClock, formatRelativeDate } from '../utils/time'

interface LoadProgress {
  jobId: string
  progress: number
  message: string
  phase: string
  targetProjectId: string | null
}

const PHASES = [
  { id: 'cache', label: 'Cache' },
  { id: 'download', label: 'Download' },
  { id: 'metadata', label: 'Metadata' },
  { id: 'thumbnails', label: 'Filmstrip' },
]

function phaseReached(current: string, target: string): boolean {
  const order = ['queued', 'running', 'cache', 'download', 'metadata', 'thumbnails', 'complete']
  return order.indexOf(current) >= order.indexOf(target)
}

export function VideoSelection() {
  const [url, setUrl] = useState('')
  const [load, setLoad] = useState<LoadProgress | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [missingProject, setMissingProject] = useState<Project | null>(null)
  const [missingError, setMissingError] = useState<string | null>(null)
  const [health, setHealth] = useState<HealthInfo | null>(null)
  const [lastProjectId, setLastProjectId] = useState<string | null>(getLastProject())
  const [unsavedDraft, setUnsavedDraft] = useState<DraftSnapshot | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  const refreshProjects = useCallback(async () => {
    setProjectsLoading(true)
    try {
      const list = await api.listProjects()
      setProjects(list)
    } catch (error) {
      toast.error('Could not load projects', errorMessage(error))
    } finally {
      setProjectsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshProjects()
    api
      .health()
      .then(setHealth)
      .catch(() => setHealth(null))
    return () => {
      controllerRef.current?.abort()
    }
  }, [refreshProjects])

  useEffect(() => {
    if (projectsLoading) return
    const lastId = getLastProject()
    if (!lastId || projects.some((project) => project.project_id === lastId)) {
      setUnsavedDraft(null)
      return
    }
    const draft = readDraftById(lastId)
    setUnsavedDraft(draft && draft.project.annotations.length > 0 ? draft : null)
  }, [projects, projectsLoading])

  const openLoadedProject = (project: Project, video: VideoInfo) => {
    openProjectWorkspace(project, video)
    setLastProjectId(project.project_id)
  }

  const runLoad = async (sourceUrl: string, targetProject: Project | null) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setLoadError(null)
    setMissingError(null)
    setLoad({
      jobId: '',
      progress: 0,
      message: 'Preparing video…',
      phase: 'queued',
      targetProjectId: targetProject?.project_id ?? null,
    })

    try {
      const started = await api.startVideoLoad(sourceUrl)
      const job = await watchJob<VideoLoadResult>(
        'video',
        started.job_id,
        (update: Job<VideoLoadResult>) => {
          setLoad({
            jobId: update.id,
            progress: update.progress,
            message: update.message,
            phase: update.phase,
            targetProjectId: targetProject?.project_id ?? null,
          })
        },
        controller.signal,
      )
      if (!job.result) throw new Error('The video could not be prepared.')
      const video = job.result
      if (targetProject) {
        const videoChanged = targetProject.video.video_id !== video.video_id
        const updatedProject: Project = {
          ...targetProject,
          video: videoRefFromInfo(video),
        }
        openLoadedProject(updatedProject, video)
        setMissingProject(null)
        if (videoChanged) {
          useProjectStore.getState().markDirty()
          toast.info(
            'Video restored',
            'Save the project to update its cached video reference.',
          )
        }
      } else {
        openNewWorkspace(video)
      }
      setLoad(null)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      const message = errorMessage(error)
      setLoadError(message)
      setMissingError(message)
      setLoad(null)
    }
  }

  const handleLoadNew = () => {
    const value = url.trim()
    if (!value) {
      setLoadError('Paste a YouTube URL to load a video.')
      return
    }
    void runLoad(value, null)
  }

  const handleOpenRecent = async (projectId: string) => {
    if (openingId || load) return
    setOpeningId(projectId)
    setLoadError(null)
    try {
      const envelope: ProjectEnvelope = await api.getProject(projectId)
      if (!envelope.video_available) {
        setMissingProject(envelope.project)
        setMissingError(null)
        return
      }
      const video = await api.getVideo(envelope.project.video.video_id)
      openLoadedProject(envelope.project, video)
    } catch (error) {
      const message = errorMessage(error)
      setLoadError(message)
      toast.error('Could not open project', message)
    } finally {
      setOpeningId(null)
    }
  }

  const handleDelete = async (project: ProjectSummary) => {
    const confirmed = window.confirm(
      `Delete the project “${project.title}”?\n\nThe cached video and exported images are kept.`,
    )
    if (!confirmed) return
    setDeletingId(project.project_id)
    try {
      await api.deleteProject(project.project_id)
      setProjects((items) => items.filter((item) => item.project_id !== project.project_id))
      if (lastProjectId === project.project_id) {
        setLastProjectId(null)
        clearLastProject()
      }
      toast.success('Project deleted', 'The source video remains in the local cache.')
    } catch (error) {
      toast.error('Could not delete project', errorMessage(error))
    } finally {
      setDeletingId(null)
    }
  }

  const handleDownloadMissing = () => {
    if (!missingProject) return
    void runLoad(missingProject.video.source_url, missingProject)
  }

  const handleRecoverDraft = async () => {
    if (!unsavedDraft) return
    setOpeningId('__draft__')
    try {
      const video = await api.getVideo(unsavedDraft.project.video.video_id)
      openDraftWorkspace(unsavedDraft, video)
      setLastProjectId(unsavedDraft.project.project_id)
    } catch (error) {
      toast.error(
        'Could not restore the unsaved session',
        `${errorMessage(error)} The cached video may be missing.`,
      )
    } finally {
      setOpeningId(null)
    }
  }

  const handleDiscardDraft = () => {
    if (!unsavedDraft) return
    const confirmed = window.confirm(
      'Discard this unsaved session? This removes the local recovery draft and cannot be undone.',
    )
    if (!confirmed) return
    removeDraft(unsavedDraft.project.project_id)
    clearLastProject()
    setUnsavedDraft(null)
    setLastProjectId(null)
  }

  const handleImportFile = async (file: File | null) => {
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text) as Project
      const saved = await api.importProject(data)
      const envelope = await api.getProject(saved.project_id)
      if (!envelope.video_available) {
        setMissingProject(envelope.project)
        setMissingError(null)
        return
      }
      const video = await api.getVideo(envelope.project.video.video_id)
      openLoadedProject(envelope.project, video)
      toast.success('Project imported', `${saved.annotations.length} regions restored.`)
    } catch (error) {
      toast.error('Could not import project', errorMessage(error))
    } finally {
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  const busy = Boolean(load)
  const activePhase = load?.phase ?? ''
  const latestProject = lastProjectId
    ? projects.find((item) => item.project_id === lastProjectId)
    : null

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-y-auto">
      <div className="pointer-events-none absolute inset-0 select-screen" />
      <header className="relative z-10 flex h-[72px] shrink-0 items-center justify-between px-8 lg:px-12">
        <Wordmark />
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-2 rounded-full border border-ink-700 bg-ink-850/70 px-3 py-1.5 text-[10.5px] font-medium text-zinc-500 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Local-first · Nothing leaves this machine
          </span>
          <button
            onClick={() => importInputRef.current?.click()}
            className="btn btn-quiet h-8"
            title="Import a project JSON file"
          >
            <FileJson className="h-3.5 w-3.5" />
            Import
          </button>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-6 pb-10 pt-2 lg:px-12">
        <div className="grid w-full max-w-[1160px] grid-cols-1 items-center gap-12 xl:grid-cols-[minmax(0,1.18fr)_minmax(350px,0.82fr)] xl:gap-16">
          <section className="animate-fade-up">
            <div className="mb-5 flex items-center gap-3">
              <span className="h-px w-8 bg-accent/80" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent/90">
                Frame-accurate annotation
              </span>
            </div>
            <h1 className="max-w-[650px] text-balance text-[38px] font-semibold leading-[1.08] tracking-[-0.035em] text-zinc-50 md:text-[46px]">
              Cut clean crops.
              <br />
              <span className="text-zinc-500">Tag without friction.</span>
            </h1>
            <p className="mt-5 max-w-[520px] text-[13.5px] leading-6 text-zinc-500">
              Load a YouTube video, scrub its timeline, draw exact regions, and export
              numbered PNGs with matching tag files. Built for long sessions and thousands
              of annotations.
            </p>

            <div className="mt-8 max-w-[620px] rounded-xl border border-ink-700 bg-ink-850/85 p-1.5 shadow-panel backdrop-blur">
              <div className="rounded-[9px] border border-ink-700/70 bg-ink-900/60 p-4">
                <label htmlFor="video-url" className="label mb-2.5 block">
                  YouTube source
                </label>
                <div className="flex items-stretch gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Youtube className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                    <input
                      id="video-url"
                      value={url}
                      onChange={(event) => {
                        setUrl(event.target.value)
                        if (loadError) setLoadError(null)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          handleLoadNew()
                        }
                      }}
                      disabled={busy}
                      className="field h-11 pl-9 font-medium"
                      placeholder="https://www.youtube.com/watch?v=…"
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </div>
                  <Button
                    variant="primary"
                    className="h-11 shrink-0 px-4"
                    onClick={handleLoadNew}
                    loading={busy}
                    disabled={busy}
                    icon={<ArrowRight className="h-4 w-4" />}
                  >
                    Load video
                  </Button>
                </div>

                {load && (
                  <div className="mt-4 rounded-lg border border-accent/20 bg-accent/[0.045] p-3.5 animate-fade-in">
                    <div className="mb-2 flex items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-2 text-[11.5px] text-zinc-300">
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent" />
                        <span className="truncate">{load.message}</span>
                      </div>
                      <span className="timecode text-[10.5px] text-accent">
                        {Math.round(load.progress)}%
                      </span>
                    </div>
                    <ProgressBar value={load.progress} />
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {PHASES.map((phase) => {
                        const reached = phaseReached(activePhase, phase.id)
                        const active = activePhase === phase.id
                        return (
                          <span
                            key={phase.id}
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[9.5px] font-medium uppercase tracking-wider',
                              reached
                                ? 'border-accent/25 bg-accent/[0.07] text-accent/90'
                                : 'border-ink-700 bg-ink-900/40 text-zinc-600',
                              active && 'border-accent/40',
                            )}
                          >
                            {reached && !active ? (
                              <Check className="h-2.5 w-2.5" />
                            ) : (
                              <span
                                className={cn(
                                  'h-1 w-1 rounded-full',
                                  active ? 'animate-soft-pulse bg-accent' : 'bg-zinc-700',
                                )}
                              />
                            )}
                            {phase.label}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}

                {loadError && !load && (
                  <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/[0.055] px-3 py-2.5 text-[11.5px] leading-relaxed text-red-300 animate-fade-in">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{loadError}</span>
                  </div>
                )}

                {health && (!health.ffmpeg || !health.ffprobe || !health.ytdlp) && (
                  <div className="mt-3 flex items-start gap-2 text-[10.5px] leading-relaxed text-amber-400/80">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Missing local tools:{' '}
                      {[
                        !health.ffmpeg && 'ffmpeg',
                        !health.ffprobe && 'ffprobe',
                        !health.ytdlp && 'yt-dlp',
                      ]
                        .filter(Boolean)
                        .join(', ')}
                      . Install them and restart the server.
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-7 grid max-w-[620px] grid-cols-3 gap-4">
              {[
                {
                  icon: <Play className="h-3.5 w-3.5" />,
                  number: '01',
                  title: 'Scrub & select',
                  text: 'Frame-step with the timeline and keyboard.',
                },
                {
                  icon: <Scissors className="h-3.5 w-3.5" />,
                  number: '02',
                  title: 'Crop & tag',
                  text: 'Multiple regions per frame, tags with autocomplete.',
                },
                {
                  icon: <FolderOpen className="h-3.5 w-3.5" />,
                  number: '03',
                  title: 'Export',
                  text: 'Sequential PNG + TXT pairs, ready to use.',
                },
              ].map((step) => (
                <div key={step.number} className="border-t border-ink-700/80 pt-3">
                  <div className="mb-2 flex items-center justify-between text-zinc-600">
                    <span className="timecode text-[9px] tracking-wider">{step.number}</span>
                    {step.icon}
                  </div>
                  <div className="text-[11.5px] font-medium text-zinc-300">{step.title}</div>
                  <div className="mt-1 text-[10px] leading-relaxed text-zinc-600">{step.text}</div>
                </div>
              ))}
            </div>
          </section>

          <aside className="min-w-0 animate-fade-up" style={{ animationDelay: '80ms' }}>
            <div className="overflow-hidden rounded-xl border border-ink-700 bg-ink-850/80 shadow-panel backdrop-blur">
              <div className="section-bar">
                <div className="flex items-center gap-2">
                  <Film className="h-3.5 w-3.5 text-zinc-500" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                    Projects
                  </span>
                  {projects.length > 0 && (
                    <span className="rounded bg-ink-750 px-1.5 py-0.5 text-[9px] text-zinc-500">
                      {projects.length}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => importInputRef.current?.click()}
                    className="icon-btn h-7 w-7"
                    title="Import project file"
                  >
                    <Upload className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => void refreshProjects()}
                    className="icon-btn h-7 w-7"
                    title="Refresh projects"
                  >
                    <Loader2 className={cn('h-3.5 w-3.5', projectsLoading && 'animate-spin')} />
                  </button>
                </div>
              </div>

              {unsavedDraft && (
                <div className="flex items-stretch border-b border-amber-500/20 bg-amber-500/[0.055]">
                  <button
                    onClick={() => void handleRecoverDraft()}
                    disabled={busy}
                    className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition hover:bg-amber-500/[0.05]"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-amber-500/25 bg-amber-500/10 text-amber-400">
                      {openingId === '__draft__' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <History className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-amber-400/90">
                        Unsaved session
                      </span>
                      <span className="mt-0.5 block truncate text-[11.5px] text-zinc-300">
                        {unsavedDraft.project.video.title || 'Local recovery draft'}
                      </span>
                      <span className="mt-0.5 block text-[8.5px] text-amber-200/40">
                        {unsavedDraft.project.annotations.length} regions ·{' '}
                        {new Date(unsavedDraft.savedAt).toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </span>
                  </button>
                  <button
                    onClick={handleDiscardDraft}
                    disabled={busy}
                    className="flex w-9 items-center justify-center text-amber-300/40 transition hover:bg-amber-500/10 hover:text-amber-200"
                    title="Discard unsaved session"
                    aria-label="Discard unsaved session"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}

              {latestProject && (
                <button
                  onClick={() => void handleOpenRecent(latestProject.project_id)}
                  disabled={busy}
                  className="group flex w-full items-center gap-3 border-b border-ink-700/70 bg-accent/[0.035] px-4 py-3 text-left transition hover:bg-accent/[0.07]"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-md border border-accent/20 bg-accent/10 text-accent">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-accent/80">
                      Resume last session
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-zinc-400">
                      {latestProject.title}
                    </span>
                  </span>
                </button>
              )}

              <div className="max-h-[420px] min-h-[250px] overflow-y-auto scroll-thin">
                {projectsLoading && projects.length === 0 ? (
                  <div className="space-y-2 p-3">
                    {[0, 1, 2].map((index) => (
                      <div
                        key={index}
                        className="h-[66px] animate-pulse rounded-lg border border-ink-700/60 bg-ink-800/50"
                      />
                    ))}
                  </div>
                ) : projects.length === 0 ? (
                  <div className="flex h-[280px] flex-col items-center justify-center px-8 text-center">
                    <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg border border-ink-700 bg-ink-800">
                      <Film className="h-5 w-5 text-zinc-600" />
                    </div>
                    <div className="text-[12px] font-medium text-zinc-400">No projects yet</div>
                    <p className="mt-1.5 max-w-[230px] text-[10.5px] leading-relaxed text-zinc-600">
                      Load a YouTube video to start your first tagging session.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1 p-2">
                    {projects.map((project) => (
                      <div
                        key={project.project_id}
                        role="button"
                        tabIndex={0}
                        onClick={() => void handleOpenRecent(project.project_id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            void handleOpenRecent(project.project_id)
                          }
                        }}
                        className={cn(
                          'group relative cursor-pointer rounded-lg border border-transparent px-3 py-2.5 transition-colors hover:border-ink-700 hover:bg-ink-800/70',
                          openingId === project.project_id && 'border-accent/30 bg-ink-800',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-[12px] font-medium text-zinc-300">
                                {project.title}
                              </span>
                              {openingId === project.project_id && (
                                <Loader2 className="h-3 w-3 shrink-0 animate-spin text-accent" />
                              )}
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9.5px] text-zinc-600">
                              <span className="inline-flex items-center gap-1">
                                <Clock3 className="h-2.5 w-2.5" />
                                {formatClock(project.duration)}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Tags className="h-2.5 w-2.5" />
                                {project.annotation_count}{' '}
                                {project.annotation_count === 1 ? 'region' : 'regions'}
                              </span>
                              <span>{formatRelativeDate(project.updated_at)}</span>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {project.video_available ? (
                              <span
                                className="inline-flex items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/[0.06] px-1.5 py-0.5 text-[8.5px] font-medium text-emerald-400/90"
                                title="Video is cached locally"
                              >
                                <HardDrive className="h-2.5 w-2.5" />
                                cached
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 rounded border border-amber-500/20 bg-amber-500/[0.06] px-1.5 py-0.5 text-[8.5px] font-medium text-amber-400/90"
                                title="Source video is not in the local cache"
                              >
                                <Download className="h-2.5 w-2.5" />
                                missing
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={(event) => {
                            event.stopPropagation()
                            void handleDelete(project)
                          }}
                          disabled={deletingId === project.project_id}
                          className="absolute bottom-2 right-2 rounded p-1 text-zinc-600 opacity-0 transition hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100 disabled:opacity-50"
                          title="Delete project"
                          aria-label={`Delete ${project.title}`}
                        >
                          {deletingId === project.project_id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-ink-700/70 bg-ink-900/30 px-4 py-2.5 text-[9.5px] text-zinc-600">
                <span>Projects live in ./data/projects</span>
                <button
                  onClick={() => importInputRef.current?.click()}
                  className="font-medium text-zinc-500 transition hover:text-accent"
                >
                  Import JSON
                </button>
              </div>
            </div>
          </aside>
        </div>
      </main>

      <footer className="relative z-10 flex shrink-0 items-center justify-between px-8 pb-5 text-[9.5px] text-zinc-700 lg:px-12">
        <span className="inline-flex items-center gap-2">
          <Link2 className="h-3 w-3" />
          VideoTagger 1.0 · Local workstation
        </span>
        <div className="flex items-center gap-4">
          {[
            { label: 'FFmpeg', ok: health?.ffmpeg },
            { label: 'FFprobe', ok: health?.ffprobe },
            { label: 'yt-dlp', ok: health?.ytdlp },
          ].map((tool) => (
            <span key={tool.label} className="inline-flex items-center gap-1.5">
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  tool.ok ? 'bg-emerald-400' : tool.ok === false ? 'bg-red-400' : 'bg-zinc-600',
                )}
              />
              {tool.label}
            </span>
          ))}
        </div>
      </footer>

      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => void handleImportFile(event.target.files?.[0] ?? null)}
      />

      <Modal
        open={Boolean(missingProject)}
        onClose={() => {
          if (load) return
          setMissingProject(null)
          setMissingError(null)
        }}
        title="Source video is not cached"
        subtitle={missingProject?.video.title || missingProject?.video.video_id}
        footer={
          <>
            <Button
              variant="quiet"
              onClick={() => {
                setMissingProject(null)
                setMissingError(null)
              }}
              disabled={Boolean(load)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={<Download className="h-3.5 w-3.5" />}
              onClick={handleDownloadMissing}
              loading={Boolean(load)}
              disabled={Boolean(load)}
            >
              Download video
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-[12px] leading-relaxed text-zinc-400">
            This project references a video that is no longer in the local cache. Download it
            again from the original source to restore your workspace. Annotations are kept
            exactly as saved.
          </p>
          <div className="rounded-lg border border-ink-700 bg-ink-900/70 p-3">
            <div className="label mb-1.5">Original source</div>
            <div className="break-all font-mono text-[10.5px] text-zinc-400">
              {missingProject?.video.source_url}
            </div>
          </div>
          {load && (
            <div className="rounded-lg border border-accent/20 bg-accent/[0.04] p-3">
              <div className="mb-2 flex items-center justify-between text-[11px] text-zinc-300">
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin text-accent" />
                  {load.message}
                </span>
                <span className="timecode text-accent">{Math.round(load.progress)}%</span>
              </div>
              <ProgressBar value={load.progress} />
            </div>
          )}
          {missingError && !load && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.05] p-3 text-[11px] leading-relaxed text-red-300">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {missingError}
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
