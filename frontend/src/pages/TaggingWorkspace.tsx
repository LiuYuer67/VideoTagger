import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { TagPanel } from '../components/TagPanel/TagPanel'
import { Timeline } from '../components/Timeline/Timeline'
import { TransportControls } from '../components/VideoPlayer/TransportControls'
import { VideoStage } from '../components/VideoPlayer/VideoStage'
import { WorkspaceHeader } from '../components/Controls/WorkspaceHeader'
import { DraftRecoveryBanner } from '../components/Controls/DraftRecoveryBanner'
import { ShortcutsModal } from '../components/Controls/ShortcutsModal'
import { ExportModal } from '../components/Controls/ExportModal'
import { ProjectBrowserModal } from '../components/Controls/ProjectBrowserModal'
import { useDraftAutosave } from '../hooks/useDraftAutosave'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { persistCurrentProject } from '../services/projectActions'
import { saveDraft } from '../services/drafts'
import { openProjectWorkspace } from '../services/workspace'
import { useProjectStore } from '../stores/projectStore'
import { toast } from '../stores/toastStore'
import type { Annotation, BoundingBox, Project, VideoInfo } from '../types'
import { clamp } from '../utils/time'

const EMPTY_ANNOTATIONS: Annotation[] = []

interface StageProps {
  video: VideoInfo
  videoRef: RefObject<HTMLVideoElement>
  onPlaybackState: (playing: boolean) => void
  onLoadedMetadata: (video: VideoInfo) => void
  onSeeked: () => void
  onPlaybackError: (message: string) => void
  onBeginInteraction: () => void
  onCreate: (box: BoundingBox) => void
  onChange: (id: string, box: BoundingBox) => void
}

function ConnectedVideoStage({
  video,
  videoRef,
  onPlaybackState,
  onLoadedMetadata,
  onSeeked,
  onPlaybackError,
  onBeginInteraction,
  onCreate,
  onChange,
}: StageProps) {
  const annotations = useProjectStore((state) => state.project?.annotations ?? EMPTY_ANNOTATIONS)
  const frame = useProjectStore((state) => state.currentFrame)
  const selectedId = useProjectStore((state) => state.selectedAnnotationId)
  const selectAnnotation = useProjectStore((state) => state.selectAnnotation)

  return (
    <VideoStage
      videoInfo={video}
      videoRef={videoRef}
      annotations={annotations}
      frame={frame}
      selectedId={selectedId}
      onSelect={selectAnnotation}
      onCreate={onCreate}
      onChange={onChange}
      onBeginInteraction={onBeginInteraction}
      onPlaybackState={onPlaybackState}
      onLoadedMetadata={() => onLoadedMetadata(video)}
      onSeeked={onSeeked}
      onPlaybackError={onPlaybackError}
    />
  )
}

interface TransportProps {
  video: VideoInfo
  speed: number
  onSpeedChange: (speed: number) => void
  onTogglePlay: () => void
  onStepFrame: (delta: number) => void
  onPrevTagged: () => void
  onNextTagged: () => void
  onShowShortcuts: () => void
}

function ConnectedTransport(props: TransportProps) {
  const currentFrame = useProjectStore((state) => state.currentFrame)
  const isPlaying = useProjectStore((state) => state.isPlaying)
  const annotations = useProjectStore((state) => state.project?.annotations ?? EMPTY_ANNOTATIONS)

  const taggedFrames = useMemo(
    () => [...new Set(annotations.map((annotation) => annotation.frame_index))].sort((a, b) => a - b),
    [annotations],
  )
  const canPrev = taggedFrames.some((frame) => frame < currentFrame)
  const canNext = taggedFrames.some((frame) => frame > currentFrame)

  return (
    <TransportControls
      isPlaying={isPlaying}
      currentTime={currentFrame / props.video.fps}
      currentFrame={currentFrame}
      duration={props.video.duration}
      fps={props.video.fps}
      speed={props.speed}
      canPrevTagged={canPrev}
      canNextTagged={canNext}
      onTogglePlay={props.onTogglePlay}
      onStepFrame={props.onStepFrame}
      onPrevTagged={props.onPrevTagged}
      onNextTagged={props.onNextTagged}
      onSpeedChange={props.onSpeedChange}
      onShowShortcuts={props.onShowShortcuts}
    />
  )
}

interface TimelineProps {
  video: VideoInfo
  onSeekTime: (time: number) => void
  onJumpToFrame: (frame: number) => void
}

function ConnectedTimeline({ video, onSeekTime, onJumpToFrame }: TimelineProps) {
  const annotations = useProjectStore((state) => state.project?.annotations ?? EMPTY_ANNOTATIONS)
  const selectedId = useProjectStore((state) => state.selectedAnnotationId)
  return (
    <Timeline
      video={video}
      annotations={annotations}
      selectedAnnotationId={selectedId}
      onSeekTime={onSeekTime}
      onJumpToFrame={onJumpToFrame}
    />
  )
}

export function TaggingWorkspace() {
  const video = useProjectStore((state) => state.video)
  const hasProject = useProjectStore((state) => Boolean(state.project))
  const projectTitle = useProjectStore((state) => state.project?.video.title ?? '')
  const projectId = useProjectStore((state) => state.project?.project_id ?? '')
  const videoId = useProjectStore((state) => state.project?.video.video_id ?? '')
  const regionCount = useProjectStore((state) => state.project?.annotations.length ?? 0)
  const dirty = useProjectStore((state) => state.dirty)
  const persisted = useProjectStore((state) => state.persisted)
  const saveState = useProjectStore((state) => state.saveState)
  const saveError = useProjectStore((state) => state.saveError)
  const lastSavedAt = useProjectStore((state) => state.lastSavedAt)
  const isPlaying = useProjectStore((state) => state.isPlaying)
  const seekNonce = useProjectStore((state) => state.seekNonce)
  const seekFrame = useProjectStore((state) => state.seekFrame)

  const videoRef = useRef<HTMLVideoElement>(null)
  const [speed, setSpeed] = useState(1)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [projectsOpen, setProjectsOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const modalOpen = shortcutsOpen || projectsOpen || exportOpen

  useDraftAutosave()

  const syncFromVideo = useCallback(() => {
    const element = videoRef.current
    if (!element) return
    useProjectStore.getState().syncPlayback(element.currentTime)
  }, [])

  useEffect(() => {
    if (!isPlaying) return
    let animationFrame = 0
    let last = 0
    const tick = (now: number) => {
      if (now - last >= 30) {
        syncFromVideo()
        last = now
      }
      animationFrame = requestAnimationFrame(tick)
    }
    animationFrame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animationFrame)
  }, [isPlaying, syncFromVideo])

  useEffect(() => {
    const element = videoRef.current
    if (element) element.playbackRate = speed
  }, [speed, video?.video_id])

  const pausePlayback = useCallback(() => {
    const element = videoRef.current
    if (element && !element.paused) element.pause()
    useProjectStore.getState().setPlaying(false)
    if (element) useProjectStore.getState().syncPlayback(element.currentTime)
  }, [])

  const revealTime = useCallback((time: number) => {
    const state = useProjectStore.getState()
    if (!state.project) return
    const duration = state.project.video.duration
    const span = state.viewEnd - state.viewStart
    if (span >= duration - 0.001) return
    if (time >= state.viewStart && time <= state.viewEnd) return
    const nextStart = clamp(time - span * 0.16, 0, Math.max(0, duration - span))
    state.setViewRange(nextStart, nextStart + span)
  }, [])

  const seekToTime = useCallback((time: number) => {
    const state = useProjectStore.getState()
    if (!state.project) return
    const target = clamp(time, 0, state.project.video.duration)
    const element = videoRef.current
    if (element) {
      if (!element.paused) element.pause()
      try {
        element.currentTime = target
      } catch {
        // The browser will clamp if metadata is not ready yet.
      }
    }
    state.setPlaying(false)
    state.syncPlayback(target)
  }, [])

  const seekToFrame = useCallback(
    (frame: number, selectFirst = false) => {
      const state = useProjectStore.getState()
      if (!state.project) return
      const { fps, duration } = state.project.video
      const target = clamp(Math.round(frame), 0, Math.ceil(duration * fps))
      const element = videoRef.current
      if (element) {
        if (!element.paused) element.pause()
        const targetTime = clamp(
          target / fps + 1 / (fps * 1000),
          0,
          Math.max(0, duration - 0.0005),
        )
        try {
          element.currentTime = targetTime
        } catch {
          // Ignore seeks before metadata is available.
        }
      }
      state.setPlaying(false)
      state.setCurrentFrame(target)
      revealTime(target / fps)
      if (selectFirst) {
        const first = state.project.annotations.find(
          (annotation) => annotation.frame_index === target,
        )
        if (first) state.selectAnnotation(first.id)
      }
    },
    [revealTime],
  )

  useEffect(() => {
    if (!seekNonce) return
    seekToFrame(seekFrame)
  }, [seekNonce, seekFrame, seekToFrame])

  const stepFrame = useCallback(
    (delta: number) => {
      const state = useProjectStore.getState()
      if (!state.project) return
      const max = Math.ceil(state.project.video.duration * state.project.video.fps)
      seekToFrame(clamp(state.currentFrame + delta, 0, max))
    },
    [seekToFrame],
  )

  const jumpTagged = useCallback(
    (direction: -1 | 1) => {
      const state = useProjectStore.getState()
      if (!state.project) return
      const frames = [...new Set(state.project.annotations.map((item) => item.frame_index))].sort(
        (a, b) => a - b,
      )
      const target =
        direction < 0
          ? [...frames].reverse().find((frame) => frame < state.currentFrame)
          : frames.find((frame) => frame > state.currentFrame)
      if (target === undefined) return
      seekToFrame(target, true)
    },
    [seekToFrame],
  )

  const handleTogglePlay = useCallback(() => {
    const element = videoRef.current
    const state = useProjectStore.getState()
    if (!element || !state.project) return
    if (element.paused) {
      if (element.currentTime >= state.project.video.duration - 0.03) {
        element.currentTime = 0
      }
      void element
        .play()
        .then(() => useProjectStore.getState().setPlaying(true))
        .catch(() => {
          toast.error('Playback could not start', 'The video may still be loading.')
        })
    } else {
      element.pause()
      useProjectStore.getState().setPlaying(false)
      syncFromVideo()
    }
  }, [syncFromVideo])

  const handlePlaybackState = useCallback(
    (playing: boolean) => {
      useProjectStore.getState().setPlaying(playing)
      if (!playing) syncFromVideo()
    },
    [syncFromVideo],
  )

  const handleLoadedMetadata = useCallback(
    (info: VideoInfo) => {
      const element = videoRef.current
      if (!element) return
      element.playbackRate = speed
      const state = useProjectStore.getState()
      if (
        element.videoWidth > 0 &&
        element.videoHeight > 0 &&
        (element.videoWidth !== info.width || element.videoHeight !== info.height)
      ) {
        state.updateVideoMetadata({
          width: element.videoWidth,
          height: element.videoHeight,
        })
      }
      const current = useProjectStore.getState()
      if (current.project && current.currentFrame > 0) {
        const fps = current.project.video.fps
        const target = clamp(
          current.currentFrame / fps + 1 / (fps * 1000),
          0,
          Math.max(0, current.project.video.duration - 0.0005),
        )
        if (Math.abs(element.currentTime - target) > 0.02) {
          try {
            element.currentTime = target
            return
          } catch {
            // Fall through to syncing with whatever the browser has loaded.
          }
        }
      }
      syncFromVideo()
    },
    [speed, syncFromVideo],
  )

  const handleBeginInteraction = useCallback(() => {
    const element = videoRef.current
    pausePlayback()
    if (element) useProjectStore.getState().syncPlayback(element.currentTime)
  }, [pausePlayback])

  const handleCreate = useCallback((box: BoundingBox) => {
    useProjectStore.getState().addAnnotation(box)
  }, [])

  const handleChange = useCallback((id: string, box: BoundingBox) => {
    useProjectStore.getState().updateAnnotationBox(id, box)
  }, [])

  const handleDelete = useCallback(() => {
    const state = useProjectStore.getState()
    if (state.selectedAnnotationId) state.deleteAnnotation(state.selectedAnnotationId)
  }, [])

  const handleEscape = useCallback(() => {
    const state = useProjectStore.getState()
    if (state.selectedAnnotationId) state.selectAnnotation(null)
  }, [])

  const handleSave = useCallback(() => {
    void persistCurrentProject()
  }, [])

  const handleOpenProject = useCallback(
    (nextProject: Project, nextVideo: VideoInfo) => {
      const state = useProjectStore.getState()
      if (state.project && state.dirty) {
        if (state.persisted && state.lastSavedAt) {
          saveDraft(state.project, state.lastSavedAt, state.currentFrame)
        } else {
          void persistCurrentProject({ quiet: true }).then((saved) => {
            if (!saved) {
              toast.error('Could not save the current project', 'The switch was cancelled.')
              return
            }
            openProjectWorkspace(nextProject, nextVideo)
            toast.info('Project opened', nextProject.video.title)
          })
          return
        }
      }
      openProjectWorkspace(nextProject, nextVideo)
      toast.info('Project opened', nextProject.video.title)
    },
    [],
  )

  const handleBack = useCallback(() => {
    const state = useProjectStore.getState()
    if (state.project && state.dirty && state.persisted) {
      if (state.lastSavedAt) {
        saveDraft(state.project, state.lastSavedAt, state.currentFrame)
      }
      const proceed = window.confirm(
        'Return to video selection?\n\nUnsaved changes are kept as a local recovery draft.',
      )
      if (!proceed) return
      state.closeWorkspace()
      return
    }
    if (state.project && state.dirty && !state.persisted) {
      void persistCurrentProject({ quiet: true }).then((saved) => {
        if (saved) useProjectStore.getState().closeWorkspace()
      })
      return
    }
    state.closeWorkspace()
  }, [])

  useKeyboardShortcuts({
    enabled: !modalOpen,
    onTogglePlay: handleTogglePlay,
    onStepFrame: stepFrame,
    onPrevTagged: () => jumpTagged(-1),
    onNextTagged: () => jumpTagged(1),
    onDelete: handleDelete,
    onEscape: handleEscape,
    onSave: handleSave,
    onExport: () => setExportOpen(true),
    onProjects: () => setProjectsOpen(true),
    onShowShortcuts: () => setShortcutsOpen(true),
    onHome: () => seekToFrame(0),
    onEnd: () => {
      const state = useProjectStore.getState()
      if (!state.project) return
      seekToFrame(Math.ceil(state.project.video.duration * state.project.video.fps))
    },
  })

  if (!hasProject || !video) return null

  return (
    <div className="flex h-full min-h-0 flex-col bg-ink-950">
      <WorkspaceHeader
        title={projectTitle}
        videoId={videoId}
        regionCount={regionCount}
        dirty={dirty}
        persisted={persisted}
        saveState={saveState}
        saveError={saveError}
        lastSavedAt={lastSavedAt}
        onBack={handleBack}
        onProjects={() => setProjectsOpen(true)}
        onSave={handleSave}
        onExport={() => setExportOpen(true)}
        onShowShortcuts={() => setShortcutsOpen(true)}
      />
      <DraftRecoveryBanner />
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col bg-ink-900">
          <ConnectedVideoStage
            video={video}
            videoRef={videoRef}
            onPlaybackState={handlePlaybackState}
            onLoadedMetadata={handleLoadedMetadata}
            onSeeked={syncFromVideo}
            onPlaybackError={(message) => toast.error('Playback error', message)}
            onBeginInteraction={handleBeginInteraction}
            onCreate={handleCreate}
            onChange={handleChange}
          />
          <ConnectedTransport
            video={video}
            speed={speed}
            onSpeedChange={setSpeed}
            onTogglePlay={handleTogglePlay}
            onStepFrame={stepFrame}
            onPrevTagged={() => jumpTagged(-1)}
            onNextTagged={() => jumpTagged(1)}
            onShowShortcuts={() => setShortcutsOpen(true)}
          />
          <ConnectedTimeline
            video={video}
            onSeekTime={seekToTime}
            onJumpToFrame={(frame) => seekToFrame(frame, true)}
          />
        </main>
        <TagPanel />
      </div>

      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <ProjectBrowserModal
        open={projectsOpen}
        onClose={() => setProjectsOpen(false)}
        currentProjectId={projectId}
        dirty={dirty}
        onOpenProject={handleOpenProject}
      />
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  )
}
