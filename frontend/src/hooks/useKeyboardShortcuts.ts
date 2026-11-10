import { useEffect } from 'react'

interface ShortcutActions {
  enabled: boolean
  onTogglePlay: () => void
  onStepFrame: (delta: number) => void
  onPrevTagged: () => void
  onNextTagged: () => void
  onDelete: () => void
  onEscape: () => void
  onSave: () => void
  onExport: () => void
  onProjects: () => void
  onShowShortcuts: () => void
  onHome: () => void
  onEnd: () => void
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    target.isContentEditable ||
    Boolean(target.closest('[contenteditable="true"]'))
  )
}

export function useKeyboardShortcuts(actions: ShortcutActions): void {
  const {
    enabled,
    onTogglePlay,
    onStepFrame,
    onPrevTagged,
    onNextTagged,
    onDelete,
    onEscape,
    onSave,
    onExport,
    onProjects,
    onShowShortcuts,
    onHome,
    onEnd,
  } = actions

  useEffect(() => {
    if (!enabled) return
    const handler = (event: KeyboardEvent) => {
      const typing = isTypingTarget(event.target)
      const modifier = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()

      if (modifier) {
        if (key === 's') {
          event.preventDefault()
          onSave()
          return
        }
        if (key === 'e') {
          event.preventDefault()
          onExport()
          return
        }
        if (key === 'o') {
          event.preventDefault()
          onProjects()
          return
        }
        return
      }

      if (typing) return

      if (event.key === '?') {
        event.preventDefault()
        onShowShortcuts()
        return
      }
      if (event.code === 'Space' || event.key === ' ') {
        event.preventDefault()
        onTogglePlay()
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        onStepFrame(event.shiftKey ? -10 : -1)
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        onStepFrame(event.shiftKey ? 10 : 1)
        return
      }
      if (event.key === '[') {
        event.preventDefault()
        onPrevTagged()
        return
      }
      if (event.key === ']') {
        event.preventDefault()
        onNextTagged()
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        onDelete()
        return
      }
      if (event.key === 'Escape') {
        onEscape()
        return
      }
      if (event.key === 'Home') {
        event.preventDefault()
        onHome()
        return
      }
      if (event.key === 'End') {
        event.preventDefault()
        onEnd()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    enabled,
    onTogglePlay,
    onStepFrame,
    onPrevTagged,
    onNextTagged,
    onDelete,
    onEscape,
    onSave,
    onExport,
    onProjects,
    onShowShortcuts,
    onHome,
    onEnd,
  ])
}
