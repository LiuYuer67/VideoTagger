import { useEffect } from 'react'
import { useProjectStore } from '../stores/projectStore'
import { saveDraft } from '../services/drafts'

export function useDraftAutosave(): void {
  const project = useProjectStore((state) => state.project)
  const dirty = useProjectStore((state) => state.dirty)
  const lastSavedAt = useProjectStore((state) => state.lastSavedAt)

  useEffect(() => {
    if (!project || !dirty || !lastSavedAt) return
    const timer = window.setTimeout(() => {
      saveDraft(project, lastSavedAt, useProjectStore.getState().currentFrame)
    }, 700)
    return () => window.clearTimeout(timer)
  }, [project, dirty, lastSavedAt])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!useProjectStore.getState().dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  useEffect(() => {
    return () => {
      const state = useProjectStore.getState()
      if (state.project && state.dirty && state.lastSavedAt) {
        saveDraft(state.project, state.lastSavedAt, state.currentFrame)
      }
    }
  }, [])
}
