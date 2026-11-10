import { create } from 'zustand'
import type {
  Annotation,
  BoundingBox,
  DraftSnapshot,
  Project,
  VideoInfo,
} from '../types'
import { clamp, frameFromTime } from '../utils/time'
import { mergeUniqueTags, normalizeTag } from '../utils/tags'
import { api } from '../services/api'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface OpenOptions {
  currentFrame?: number
  draft?: DraftSnapshot | null
  persisted?: boolean
}

interface ProjectStore {
  project: Project | null
  video: VideoInfo | null
  currentTime: number
  currentFrame: number
  isPlaying: boolean
  selectedAnnotationId: string | null
  viewStart: number
  viewEnd: number
  globalTags: string[]
  dirty: boolean
  persisted: boolean
  saveState: SaveState
  lastSavedAt: string | null
  saveError: string | null
  pendingDraft: DraftSnapshot | null
  seekNonce: number
  seekFrame: number
  useLastTags: boolean

  openWorkspace: (project: Project, video: VideoInfo, options?: OpenOptions) => void
  closeWorkspace: () => void
  syncPlayback: (time: number, frame?: number) => void
  setCurrentTime: (time: number) => void
  setCurrentFrame: (frame: number) => void
  setPlaying: (playing: boolean) => void
  selectAnnotation: (id: string | null) => void
  addAnnotation: (bbox: BoundingBox) => string | null
  updateAnnotationBox: (id: string, bbox: BoundingBox) => void
  deleteAnnotation: (id: string) => void
  addTagsToAnnotation: (id: string, tags: string[]) => void
  removeTagFromAnnotation: (id: string, tag: string) => void
  replaceAnnotationTags: (id: string, tags: string[]) => void
  recordGlobalTag: (tag: string) => void
  setGlobalTags: (tags: string[]) => void
  setViewRange: (start: number, end: number) => void
  resetView: () => void
  markSaved: (project: Project) => void
  markSavedWithNewerChanges: (saved: Project) => void
  setSaveState: (state: SaveState, error?: string | null) => void
  setPendingDraft: (draft: DraftSnapshot | null) => void
  applyDraft: (draft: DraftSnapshot) => void
  updateVideoMetadata: (metadata: Partial<VideoInfo>) => void
  markDirty: () => void
  setUseLastTags: (enabled: boolean) => void
}

const nowIso = () => new Date().toISOString()
const USE_LAST_TAGS_KEY = 'videotagger:use-last-tags'

function readUseLastTags(): boolean {
  try {
    return localStorage.getItem(USE_LAST_TAGS_KEY) === 'true'
  } catch {
    return false
  }
}

function inheritedTagsForNewBox(annotations: Annotation[], frame: number): string[] {
  // Prefer the first region already on this frame, then the nearest earlier
  // tagged frame. If those do not exist, fall back to the most recently
  // created region so the toggle still helps when working backwards.
  const sameFrame = annotations.find((annotation) => annotation.frame_index === frame)
  if (sameFrame) return [...sameFrame.tags]

  let previousFrame = -1
  let previousAnnotation: Annotation | null = null
  for (const annotation of annotations) {
    if (annotation.frame_index >= frame) continue
    if (annotation.frame_index > previousFrame) {
      previousFrame = annotation.frame_index
      previousAnnotation = annotation
    }
  }
  if (previousAnnotation) return [...previousAnnotation.tags]
  if (annotations.length) return [...annotations[annotations.length - 1].tags]
  return []
}

function cloneProject(project: Project): Project {
  return {
    ...project,
    video: { ...project.video },
    annotations: project.annotations.map((annotation) => ({
      ...annotation,
      bbox: { ...annotation.bbox },
      tags: [...annotation.tags],
    })),
  }
}

function maxFrame(project: Project): number {
  return Math.max(0, Math.ceil(project.video.duration * project.video.fps))
}

function withProject(
  state: ProjectStore,
  next: Project,
  extra: Partial<ProjectStore> = {},
): Partial<ProjectStore> {
  return {
    project: { ...next, updated_at: nowIso() },
    dirty: true,
    saveState: state.saveState === 'saving' ? state.saveState : 'idle',
    ...extra,
  }
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  project: null,
  video: null,
  currentTime: 0,
  currentFrame: 0,
  isPlaying: false,
  selectedAnnotationId: null,
  viewStart: 0,
  viewEnd: 0,
  globalTags: [],
  dirty: false,
  persisted: false,
  saveState: 'idle',
  lastSavedAt: null,
  saveError: null,
  pendingDraft: null,
  seekNonce: 0,
  seekFrame: 0,
  useLastTags: readUseLastTags(),

  openWorkspace: (project, video, options = {}) => {
    const mergedVideo = {
      ...project.video,
      title: video.title || project.video.title,
      width: video.width || project.video.width,
      height: video.height || project.video.height,
      fps: video.fps || project.video.fps,
      duration: video.duration || project.video.duration,
    }
    const nextProject = cloneProject({ ...project, video: mergedVideo })
    const duration = nextProject.video.duration
    const requestedFrame = clamp(
      options.currentFrame ?? 0,
      0,
      maxFrame(nextProject),
    )
    set({
      project: nextProject,
      video,
      currentFrame: requestedFrame,
      currentTime: requestedFrame / nextProject.video.fps,
      isPlaying: false,
      selectedAnnotationId: null,
      viewStart: 0,
      viewEnd: duration,
      dirty: false,
      persisted: options.persisted ?? true,
      saveState: 'idle',
      saveError: null,
      pendingDraft: options.draft ?? null,
      lastSavedAt: nextProject.updated_at,
      seekNonce: requestedFrame > 0 ? get().seekNonce + 1 : get().seekNonce,
      seekFrame: requestedFrame,
    })
  },

  closeWorkspace: () =>
    set({
      project: null,
      video: null,
      currentTime: 0,
      currentFrame: 0,
      isPlaying: false,
      selectedAnnotationId: null,
      viewStart: 0,
      viewEnd: 0,
      dirty: false,
      persisted: false,
      saveState: 'idle',
      saveError: null,
      pendingDraft: null,
      seekNonce: 0,
      seekFrame: 0,
    }),

  syncPlayback: (time, frame) =>
    set((state) => {
      if (!state.project) return state
      const fps = state.project.video.fps
      const nextFrame =
        frame ?? clamp(frameFromTime(time, fps), 0, maxFrame(state.project))
      const nextTime = clamp(time, 0, state.project.video.duration)
      let selected = state.selectedAnnotationId
      if (selected) {
        const annotation = state.project.annotations.find((item) => item.id === selected)
        if (!annotation || annotation.frame_index !== nextFrame) selected = null
      }
      return {
        currentTime: nextTime,
        currentFrame: nextFrame,
        selectedAnnotationId: selected,
      }
    }),

  setCurrentTime: (time) =>
    set((state) => {
      if (!state.project) return state
      const clamped = clamp(time, 0, state.project.video.duration)
      return { currentTime: clamped }
    }),

  setCurrentFrame: (frame) =>
    set((state) => {
      if (!state.project) return state
      const fps = state.project.video.fps
      const nextFrame = clamp(Math.round(frame), 0, maxFrame(state.project))
      let selected = state.selectedAnnotationId
      if (selected) {
        const annotation = state.project.annotations.find((item) => item.id === selected)
        if (!annotation || annotation.frame_index !== nextFrame) selected = null
      }
      return {
        currentFrame: nextFrame,
        currentTime: nextFrame / fps,
        selectedAnnotationId: selected,
      }
    }),

  setPlaying: (playing) => set({ isPlaying: playing }),

  selectAnnotation: (id) => set({ selectedAnnotationId: id }),

  addAnnotation: (bbox) => {
    const state = get()
    if (!state.project) return null
    if (bbox.width < 0.002 || bbox.height < 0.002) return null
    const frame = state.currentFrame
    const id = `ann-${crypto.randomUUID()}`
    const annotation: Annotation = {
      id,
      timestamp: frame / state.project.video.fps,
      frame_index: frame,
      bbox,
      tags: state.useLastTags
        ? inheritedTagsForNewBox(state.project.annotations, frame)
        : [],
    }
    const next: Project = {
      ...state.project,
      annotations: [...state.project.annotations, annotation],
    }
    set(
      withProject(state, next, {
        selectedAnnotationId: id,
      }) as ProjectStore,
    )
    return id
  },

  updateAnnotationBox: (id, bbox) => {
    const state = get()
    if (!state.project) return
    const next: Project = {
      ...state.project,
      annotations: state.project.annotations.map((annotation) =>
        annotation.id === id ? { ...annotation, bbox } : annotation,
      ),
    }
    set(withProject(state, next) as ProjectStore)
  },

  deleteAnnotation: (id) => {
    const state = get()
    if (!state.project) return
    const next: Project = {
      ...state.project,
      annotations: state.project.annotations.filter((annotation) => annotation.id !== id),
    }
    set(
      withProject(state, next, {
        selectedAnnotationId:
          state.selectedAnnotationId === id ? null : state.selectedAnnotationId,
      }) as ProjectStore,
    )
  },

  addTagsToAnnotation: (id, tags) => {
    const state = get()
    if (!state.project) return
    const normalized = tags.map(normalizeTag).filter(Boolean)
    if (!normalized.length) return
    const next: Project = {
      ...state.project,
      annotations: state.project.annotations.map((annotation) =>
        annotation.id === id
          ? { ...annotation, tags: mergeUniqueTags(annotation.tags, normalized) }
          : annotation,
      ),
    }
    set(withProject(state, next) as ProjectStore)
    for (const tag of normalized) get().recordGlobalTag(tag)
  },

  removeTagFromAnnotation: (id, tag) => {
    const state = get()
    if (!state.project) return
    const next: Project = {
      ...state.project,
      annotations: state.project.annotations.map((annotation) =>
        annotation.id === id
          ? {
              ...annotation,
              tags: annotation.tags.filter(
                (item) => item.toLocaleLowerCase() !== tag.toLocaleLowerCase(),
              ),
            }
          : annotation,
      ),
    }
    set(withProject(state, next) as ProjectStore)
  },

  replaceAnnotationTags: (id, tags) => {
    const state = get()
    if (!state.project) return
    const next: Project = {
      ...state.project,
      annotations: state.project.annotations.map((annotation) =>
        annotation.id === id
          ? { ...annotation, tags: mergeUniqueTags([], tags) }
          : annotation,
      ),
    }
    set(withProject(state, next) as ProjectStore)
    for (const tag of tags) get().recordGlobalTag(tag)
  },

  recordGlobalTag: (raw) => {
    const tag = normalizeTag(raw)
    if (!tag) return
    const state = get()
    if (state.globalTags.some((item) => item.toLocaleLowerCase() === tag.toLocaleLowerCase())) {
      return
    }
    set({ globalTags: [...state.globalTags, tag] })
    api
      .addTags([tag])
      .then(({ tags }) => set({ globalTags: tags }))
      .catch(() => {
        // The local dictionary is still useful if the persistence call fails.
      })
  },

  setGlobalTags: (tags) => set({ globalTags: tags }),

  setViewRange: (start, end) =>
    set((state) => {
      if (!state.project) return state
      const duration = state.project.video.duration
      const safeEnd = clamp(end, 0, duration)
      const safeStart = clamp(start, 0, Math.max(0, safeEnd - 0.001))
      return { viewStart: safeStart, viewEnd: Math.max(safeStart + 0.001, safeEnd) }
    }),

  resetView: () =>
    set((state) =>
      state.project ? { viewStart: 0, viewEnd: state.project.video.duration } : state,
    ),

  markSaved: (project) =>
    set({
      project: cloneProject(project),
      persisted: true,
      dirty: false,
      saveState: 'saved',
      lastSavedAt: project.updated_at,
      saveError: null,
      pendingDraft: null,
    }),

  markSavedWithNewerChanges: (saved) =>
    set({
      persisted: true,
      dirty: true,
      saveState: 'saved',
      lastSavedAt: saved.updated_at,
      saveError: null,
    }),

  setSaveState: (saveState, saveError = null) => set({ saveState, saveError }),

  setPendingDraft: (draft) => set({ pendingDraft: draft }),

  applyDraft: (draft) => {
    const state = get()
    if (!state.project || !state.video) return
    const project = cloneProject(draft.project)
    const frame = clamp(draft.currentFrame, 0, maxFrame(project))
    const first = project.annotations.find((annotation) => annotation.frame_index === frame)
    set({
      project: { ...project, updated_at: nowIso() },
      currentFrame: frame,
      currentTime: frame / project.video.fps,
      selectedAnnotationId: first?.id ?? null,
      viewStart: 0,
      viewEnd: project.video.duration,
      dirty: true,
      saveState: 'idle',
      pendingDraft: null,
      seekNonce: state.seekNonce + 1,
      seekFrame: frame,
    })
  },

  updateVideoMetadata: (metadata) => {
    const state = get()
    if (!state.project || !state.video) return
    const nextVideo = { ...state.video, ...metadata }
    const changed =
      nextVideo.width !== state.project.video.width ||
      nextVideo.height !== state.project.video.height ||
      Math.abs(nextVideo.fps - state.project.video.fps) > 0.001
    set({ video: nextVideo })
    if (!changed) return
    set({
      project: {
        ...state.project,
        video: {
          ...state.project.video,
          width: nextVideo.width,
          height: nextVideo.height,
          fps: nextVideo.fps,
        },
      },
      dirty: true,
    })
  },

  markDirty: () => set({ dirty: true }),

  setUseLastTags: (enabled) => {
    try {
      localStorage.setItem(USE_LAST_TAGS_KEY, enabled ? 'true' : 'false')
    } catch {
      // The preference still applies to this session.
    }
    set({ useLastTags: enabled })
  },
}))
