import { useProjectStore } from '../stores/projectStore'
import { toast } from '../stores/toastStore'
import type { Project } from '../types'
import { ApiError, api, errorMessage } from './api'
import { removeDraft, saveDraft } from './drafts'

export async function persistCurrentProject(options: { quiet?: boolean } = {}): Promise<Project | null> {
  const state = useProjectStore.getState()
  if (!state.project) return null
  const projectAtStart = state.project
  state.setSaveState('saving')
  try {
    let saved: Project
    if (state.persisted) {
      saved = await api.updateProject(projectAtStart)
    } else {
      try {
        saved = await api.createProject(projectAtStart)
      } catch (error) {
        if (error instanceof ApiError && error.code === 'PROJECT_EXISTS') {
          saved = await api.updateProject(projectAtStart)
        } else {
          throw error
        }
      }
    }
    const current = useProjectStore.getState()
    if (current.project && current.project !== projectAtStart) {
      // Edits continued while the request was in flight. Keep the newer local
      // project, but remember that an earlier snapshot is now on disk.
      current.markSavedWithNewerChanges(saved)
      saveDraft(current.project, saved.updated_at, current.currentFrame)
      if (!options.quiet) {
        toast.info('Saved', 'Changes made during the save remain unsaved.')
      }
      return saved
    }
    current.markSaved(saved)
    removeDraft(saved.project_id)
    if (!options.quiet) {
      toast.success('Project saved', 'All annotations are stored on disk.')
    }
    return saved
  } catch (error) {
    const message = errorMessage(error)
    useProjectStore.getState().setSaveState('error', message)
    toast.error('Could not save project', message)
    return null
  }
}
