import type { DraftSnapshot, Project } from '../types'

const DRAFT_PREFIX = 'videotagger:draft:'
const LAST_PROJECT_KEY = 'videotagger:last-project'

export function saveDraft(project: Project, baseUpdatedAt: string, currentFrame: number): void {
  const snapshot: DraftSnapshot = {
    project,
    baseUpdatedAt,
    currentFrame,
    savedAt: Date.now(),
  }
  try {
    localStorage.setItem(`${DRAFT_PREFIX}${project.project_id}`, JSON.stringify(snapshot))
  } catch {
    // Draft storage is best-effort; the manual save path is authoritative.
  }
}

export function readDraftById(projectId: string): DraftSnapshot | null {
  try {
    const raw = localStorage.getItem(`${DRAFT_PREFIX}${projectId}`)
    if (!raw) return null
    const snapshot = JSON.parse(raw) as DraftSnapshot
    if (!snapshot?.project || snapshot.project.project_id !== projectId) return null
    return snapshot
  } catch {
    return null
  }
}

export function readDraft(project: Project): DraftSnapshot | null {
  const snapshot = readDraftById(project.project_id)
  if (!snapshot) return null
  if (snapshot.baseUpdatedAt !== project.updated_at) {
    removeDraft(project.project_id)
    return null
  }
  return snapshot
}

export function removeDraft(projectId: string): void {
  try {
    localStorage.removeItem(`${DRAFT_PREFIX}${projectId}`)
  } catch {
    // Ignore storage failures.
  }
}

export function setLastProject(projectId: string): void {
  try {
    localStorage.setItem(LAST_PROJECT_KEY, projectId)
  } catch {
    // Ignore storage failures.
  }
}

export function getLastProject(): string | null {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY)
  } catch {
    return null
  }
}

export function clearLastProject(): void {
  try {
    localStorage.removeItem(LAST_PROJECT_KEY)
  } catch {
    // Ignore storage failures.
  }
}
