import { History, RotateCcw, X } from 'lucide-react'
import { useProjectStore } from '../../stores/projectStore'
import { toast } from '../../stores/toastStore'
import { removeDraft } from '../../services/drafts'

export function DraftRecoveryBanner() {
  const draft = useProjectStore((state) => state.pendingDraft)
  const applyDraft = useProjectStore((state) => state.applyDraft)
  const setPendingDraft = useProjectStore((state) => state.setPendingDraft)

  if (!draft) return null
  const date = new Date(draft.savedAt)
  const label = Number.isNaN(date.getTime())
    ? 'earlier'
    : date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })

  return (
    <div className="flex h-[38px] shrink-0 items-center gap-3 border-b border-amber-500/20 bg-amber-500/[0.06] px-4">
      <History className="h-3.5 w-3.5 shrink-0 text-amber-400" />
      <span className="min-w-0 flex-1 truncate text-[10.5px] text-amber-200/80">
        Unsaved draft found from {label} — {draft.project.annotations.length} regions.
      </span>
      <button
        onClick={() => {
          applyDraft(draft)
          toast.success('Draft restored', 'Save the project to make these changes permanent.')
        }}
        className="flex h-6 items-center gap-1.5 rounded border border-amber-500/30 bg-amber-500/10 px-2 text-[9.5px] font-medium text-amber-300 transition hover:bg-amber-500/20"
      >
        <RotateCcw className="h-2.5 w-2.5" />
        Restore draft
      </button>
      <button
        onClick={() => {
          removeDraft(draft.project.project_id)
          setPendingDraft(null)
        }}
        className="flex h-6 w-6 items-center justify-center rounded text-amber-300/50 transition hover:bg-white/5 hover:text-amber-200"
        title="Discard draft"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
