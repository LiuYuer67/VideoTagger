import { readDraft, setLastProject } from './drafts'
import { useProjectStore } from '../stores/projectStore'
import { api } from './api'
import type { DraftSnapshot, Project, VideoInfo, VideoRef } from '../types'
import { mergeUniqueTags } from '../utils/tags'

export function videoRefFromInfo(video: VideoInfo): VideoRef {
  return {
    source_url: video.source_url,
    video_id: video.video_id,
    filename: video.filename,
    title: video.title,
    duration: video.duration,
    width: video.width,
    height: video.height,
    fps: video.fps,
  }
}

export function buildProject(video: VideoInfo): Project {
  const now = new Date().toISOString()
  return {
    version: 1,
    project_id: crypto.randomUUID(),
    video: videoRefFromInfo(video),
    annotations: [],
    created_at: now,
    updated_at: now,
  }
}

function registerProjectTags(project: Project): void {
  const projectTags = mergeUniqueTags(
    [],
    project.annotations.flatMap((annotation) => annotation.tags),
  )
  if (!projectTags.length) return
  const state = useProjectStore.getState()
  const known = new Set(state.globalTags.map((tag) => tag.toLocaleLowerCase()))
  const missing = projectTags.filter((tag) => !known.has(tag.toLocaleLowerCase()))
  if (!missing.length) return
  state.setGlobalTags(mergeUniqueTags(state.globalTags, missing))
  api
    .addTags(missing)
    .then(({ tags: saved }) => useProjectStore.getState().setGlobalTags(saved))
    .catch(() => {
      // Suggestions still work for this session from the optimistic merge.
    })
}

export function openProjectWorkspace(project: Project, video: VideoInfo): void {
  const draft = readDraft(project)
  useProjectStore.getState().openWorkspace(project, video, {
    draft,
    persisted: true,
  })
  setLastProject(project.project_id)
  registerProjectTags(draft?.project ?? project)
}

export function openNewWorkspace(video: VideoInfo): Project {
  const project = buildProject(video)
  useProjectStore.getState().openWorkspace(project, video, { persisted: false })
  setLastProject(project.project_id)
  return project
}

export function openDraftWorkspace(snapshot: DraftSnapshot, video: VideoInfo): void {
  const store = useProjectStore.getState()
  store.openWorkspace(snapshot.project, video, {
    persisted: false,
    currentFrame: snapshot.currentFrame,
  })
  store.applyDraft(snapshot)
  setLastProject(snapshot.project.project_id)
}
