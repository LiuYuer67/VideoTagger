import {
  Check,
  ChevronLeft,
  Download,
  FolderOpen,
  Keyboard,
  Loader2,
  Save,
  TriangleAlert,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { Wordmark } from '../ui/Logo'
import { cn } from '../../utils/cn'
import type { SaveState } from '../../stores/projectStore'

interface WorkspaceHeaderProps {
  title: string
  videoId: string
  regionCount: number
  dirty: boolean
  persisted: boolean
  saveState: SaveState
  saveError: string | null
  lastSavedAt: string | null
  onBack: () => void
  onProjects: () => void
  onSave: () => void
  onExport: () => void
  onShowShortcuts: () => void
}

function savedTime(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function WorkspaceHeader({
  title,
  videoId,
  regionCount,
  dirty,
  persisted,
  saveState,
  saveError,
  lastSavedAt,
  onBack,
  onProjects,
  onSave,
  onExport,
  onShowShortcuts,
}: WorkspaceHeaderProps) {
  const saving = saveState === 'saving'
  return (
    <header className="flex h-[54px] shrink-0 items-center justify-between border-b border-ink-700/80 bg-[#0d1014] px-3">
      <div className="flex min-w-0 items-center gap-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-zinc-500 transition-colors hover:bg-ink-800 hover:text-zinc-200"
          title="Back to video selection"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <Wordmark compact />
        </button>
        <div className="h-6 w-px shrink-0 bg-ink-700" />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[12px] font-medium text-zinc-200">{title}</span>
            {dirty && (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                title="Unsaved changes"
              />
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[8.5px] text-zinc-600">
            <span className="timecode">YT · {videoId}</span>
            <span className="h-2 w-px bg-ink-700" />
            <span>
              {regionCount} region{regionCount === 1 ? '' : 's'}
            </span>
            <span className="h-2 w-px bg-ink-700" />
            <span
              className={cn(
                'inline-flex items-center gap-1',
                saveState === 'error'
                  ? 'text-red-400'
                  : dirty
                    ? 'text-amber-400/80'
                    : 'text-zinc-600',
              )}
              title={saveError ?? undefined}
            >
              {saving ? (
                <>
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  Saving…
                </>
              ) : saveState === 'error' ? (
                <>
                  <TriangleAlert className="h-2.5 w-2.5" />
                  Save failed
                </>
              ) : dirty ? (
                'Unsaved changes'
              ) : !persisted ? (
                'Not saved yet'
              ) : lastSavedAt ? (
                <>
                  <Check className="h-2.5 w-2.5 text-emerald-500/70" />
                  Saved {savedTime(lastSavedAt)}
                </>
              ) : (
                'Draft'
              )}
            </span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          onClick={onProjects}
          className="btn btn-quiet h-8 px-2.5 text-[11px]"
          title="Open projects (Ctrl+O)"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Projects
        </button>
        <button
          onClick={onShowShortcuts}
          className="icon-btn h-8 w-8"
          title="Keyboard shortcuts (?)"
        >
          <Keyboard className="h-3.5 w-3.5" />
        </button>
        <div className="mx-1 h-5 w-px bg-ink-700" />
        <Button
          className="h-8 px-2.5 text-[11px]"
          onClick={onSave}
          loading={saving}
          icon={<Save className="h-3.5 w-3.5" />}
          title="Save project (Ctrl+S)"
        >
          Save
        </Button>
        <Button
          variant="primary"
          className="h-8 px-3 text-[11px]"
          onClick={onExport}
          icon={<Download className="h-3.5 w-3.5" />}
          title="Export crops (Ctrl+E)"
        >
          Export
        </Button>
      </div>
    </header>
  )
}
