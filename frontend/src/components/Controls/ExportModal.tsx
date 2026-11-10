import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  FileImage,
  FileText,
  FolderOpen,
  Loader2,
  Package,
  Tags,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { ProgressBar } from '../ui/ProgressBar'
import { api, errorMessage, watchJob } from '../../services/api'
import { persistCurrentProject } from '../../services/projectActions'
import { useProjectStore } from '../../stores/projectStore'
import { toast } from '../../stores/toastStore'
import type { ExportResult, Job } from '../../types'
import { formatBytes } from '../../utils/time'
import { cn } from '../../utils/cn'

type Phase = 'idle' | 'running' | 'success' | 'error'

export function ExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const project = useProjectStore((state) => state.project)
  const dirty = useProjectStore((state) => state.dirty)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('')
  const [result, setResult] = useState<ExportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setPhase('idle')
    setProgress(0)
    setMessage('')
    setResult(null)
    setError(null)
  }, [open])

  const annotations = project?.annotations ?? []
  const untagged = annotations.filter((annotation) => annotation.tags.length === 0).length
  const total = annotations.length
  const running = phase === 'running'
  const currentItem = total > 0 ? Math.min(total, Math.max(0, Math.round((progress / 100) * total))) : 0

  const handleStart = async () => {
    if (!project || total === 0) return
    setPhase('running')
    setProgress(0)
    setMessage('Saving project…')
    setError(null)
    setResult(null)
    try {
      const saved = await persistCurrentProject({ quiet: true })
      if (!saved) {
        throw new Error(
          useProjectStore.getState().saveError ||
            'The project must be saved before exporting.',
        )
      }
      setMessage('Starting export…')
      const started = await api.startExport(saved.project_id)
      const job = await watchJob<ExportResult>('export', started.job_id, (update: Job<ExportResult>) => {
        setProgress(update.progress)
        setMessage(update.message)
      })
      if (!job.result) throw new Error('The export finished without a result.')
      setResult(job.result)
      setProgress(100)
      setMessage('Export complete')
      setPhase('success')
      toast.success(
        'Export complete',
        `${job.result.image_count} PNG + TXT pairs written to ${job.result.folder_name}.`,
      )
    } catch (caught) {
      const detail = errorMessage(caught)
      setError(detail)
      setPhase('error')
      toast.error('Export failed', detail)
    }
  }

  const handleOpenFolder = async () => {
    if (!result) return
    try {
      await api.openExportFolder(result.folder_name)
    } catch (caught) {
      toast.error('Could not open folder', errorMessage(caught))
    }
  }

  const handleCopy = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.path)
      toast.success('Path copied')
    } catch {
      toast.error('Could not copy path')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeDisabled={running}
      title="Export cropped regions"
      subtitle="Every region becomes a numbered PNG with a matching comma-separated TXT file."
      size="md"
      footer={
        phase === 'success' ? (
          <>
            <Button variant="quiet" onClick={onClose}>
              Done
            </Button>
            <Button
              variant="primary"
              icon={<FolderOpen className="h-3.5 w-3.5" />}
              onClick={() => void handleOpenFolder()}
            >
              Open export folder
            </Button>
          </>
        ) : phase === 'error' ? (
          <>
            <Button variant="quiet" onClick={onClose}>
              Close
            </Button>
            <Button variant="primary" onClick={() => void handleStart()}>
              Retry export
            </Button>
          </>
        ) : running ? (
          <Button variant="quiet" disabled loading>
            Exporting…
          </Button>
        ) : (
          <>
            <Button variant="quiet" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={<Package className="h-3.5 w-3.5" />}
              onClick={() => void handleStart()}
              disabled={total === 0}
            >
              Export {total} region{total === 1 ? '' : 's'}
            </Button>
          </>
        )
      }
    >
      {phase === 'idle' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {[
              {
                icon: <FileImage className="h-3.5 w-3.5" />,
                value: total,
                label: 'PNG crops',
              },
              {
                icon: <FileText className="h-3.5 w-3.5" />,
                value: total,
                label: 'TXT files',
              },
              {
                icon: <Tags className="h-3.5 w-3.5" />,
                value: annotations.reduce((sum, item) => sum + item.tags.length, 0),
                label: 'tag entries',
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-ink-700 bg-ink-900/60 px-3 py-2.5"
              >
                <span className="text-zinc-600">{item.icon}</span>
                <div className="timecode mt-1.5 text-[18px] leading-none text-zinc-100">
                  {item.value}
                </div>
                <div className="mt-1 text-[8.5px] uppercase tracking-wider text-zinc-600">
                  {item.label}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-ink-700 bg-ink-900/45 p-3.5">
            <div className="label mb-2">Output</div>
            <div className="flex items-start gap-2.5">
              <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" />
              <div className="min-w-0 text-[10.5px] leading-relaxed text-zinc-500">
                <div className="font-mono text-zinc-400">
                  data/exports/{'{video_title}'}_export_{'{timestamp}'}/
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[9px] text-zinc-600">
                  <span>1.png</span>
                  <span>1.txt</span>
                  <span>2.png</span>
                  <span>2.txt</span>
                  <span>…</span>
                </div>
              </div>
            </div>
          </div>

          {untagged > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2.5 text-[10.5px] leading-relaxed text-amber-200/75">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {untagged} region{untagged === 1 ? ' has' : 's have'} no tags.{' '}
              {untagged === 1 ? 'Its TXT file will' : 'Their TXT files will'} still be
              created, but will be empty.
            </div>
          )}

          {dirty && (
            <div className="flex items-start gap-2 rounded-lg border border-sky-500/15 bg-sky-500/[0.04] px-3 py-2.5 text-[10.5px] leading-relaxed text-sky-200/70">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Unsaved changes will be saved automatically before the export begins.
            </div>
          )}

          {total === 0 && (
            <div className="rounded-lg border border-dashed border-ink-650 px-4 py-6 text-center text-[11px] text-zinc-500">
              Draw at least one region before exporting.
            </div>
          )}
        </div>
      )}

      {phase === 'running' && (
        <div className="space-y-5 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/25 bg-accent/10 text-accent">
                <Loader2 className="h-4 w-4 animate-spin" />
              </span>
              <div>
                <div className="text-[12px] font-medium text-zinc-200">{message}</div>
                <div className="mt-0.5 text-[9.5px] text-zinc-600">
                  Processing frame crops at full resolution
                </div>
              </div>
            </div>
            <span className="timecode text-[14px] text-accent">{Math.round(progress)}%</span>
          </div>
          <ProgressBar value={progress} />
          <div className="grid grid-cols-3 gap-2 rounded-lg border border-ink-700 bg-ink-900/45 p-3">
            <div>
              <div className="label mb-1">Current</div>
              <div className="timecode text-[12px] text-zinc-300">
                {currentItem} <span className="text-zinc-600">/ {total}</span>
              </div>
            </div>
            <div>
              <div className="label mb-1">Images</div>
              <div className="timecode text-[12px] text-zinc-300">{currentItem}</div>
            </div>
            <div>
              <div className="label mb-1">Tag files</div>
              <div className="timecode text-[12px] text-zinc-300">{currentItem}</div>
            </div>
          </div>
          <p className="text-[9.5px] leading-relaxed text-zinc-600">
            Export runs in the background. Keep this window open until it completes.
          </p>
        </div>
      )}

      {phase === 'success' && result && (
        <div className="space-y-4">
          <div className="flex flex-col items-center border-b border-ink-700/70 pb-5 pt-1 text-center">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-emerald-500/25 bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <div className="text-[14px] font-semibold text-zinc-100">Export complete</div>
            <div className="mt-1 text-[10.5px] text-zinc-500">
              {result.image_count} PNG crops and {result.tag_file_count} tag files saved.
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded border border-ink-700 bg-ink-900/50 px-3 py-2">
              <div className="label mb-1">Images</div>
              <div className="timecode text-[14px] text-zinc-200">{result.image_count}</div>
            </div>
            <div className="rounded border border-ink-700 bg-ink-900/50 px-3 py-2">
              <div className="label mb-1">Tag files</div>
              <div className="timecode text-[14px] text-zinc-200">{result.tag_file_count}</div>
            </div>
            <div className="rounded border border-ink-700 bg-ink-900/50 px-3 py-2">
              <div className="label mb-1">Size</div>
              <div className="timecode text-[14px] text-zinc-200">
                {formatBytes(result.total_bytes)}
              </div>
            </div>
          </div>

          {result.empty_tag_count > 0 && (
            <div className="flex items-start gap-2 rounded border border-amber-500/15 bg-amber-500/[0.04] px-3 py-2 text-[10px] leading-relaxed text-amber-200/70">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {result.empty_tag_count} exported tag file
              {result.empty_tag_count === 1 ? ' is' : 's are'} empty.
            </div>
          )}

          <div className="rounded-lg border border-ink-700 bg-ink-900/55 p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="label">Folder</span>
              <button
                onClick={() => void handleCopy()}
                className="inline-flex items-center gap-1 text-[9px] text-zinc-600 transition hover:text-zinc-300"
              >
                <Copy className="h-2.5 w-2.5" />
                copy path
              </button>
            </div>
            <div className="break-all font-mono text-[9.5px] leading-relaxed text-zinc-400">
              {result.path}
            </div>
            <div className="mt-2 border-t border-ink-700/70 pt-2 text-[8.5px] text-zinc-600">
              {result.width} × {result.height} source · crops preserve original resolution
            </div>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="space-y-4 py-1">
          <div className="flex items-start gap-3 rounded-lg border border-red-500/25 bg-red-500/[0.055] p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <div>
              <div className="text-[12px] font-medium text-red-300">Export stopped</div>
              <p className="mt-1 text-[10.5px] leading-relaxed text-red-200/65">{error}</p>
            </div>
          </div>
          <p className="text-[9.5px] leading-relaxed text-zinc-600">
            No partial export folder is left behind. Your project and annotations are unchanged.
          </p>
        </div>
      )}

      <div className={cn('mt-4', phase === 'running' && 'hidden')} />
    </Modal>
  )
}
