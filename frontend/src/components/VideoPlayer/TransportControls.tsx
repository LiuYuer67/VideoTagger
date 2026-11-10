import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Keyboard,
  Pause,
  Play,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { formatTimecode } from '../../utils/time'

interface TransportControlsProps {
  isPlaying: boolean
  currentTime: number
  currentFrame: number
  duration: number
  fps: number
  speed: number
  canPrevTagged: boolean
  canNextTagged: boolean
  onTogglePlay: () => void
  onStepFrame: (delta: number) => void
  onPrevTagged: () => void
  onNextTagged: () => void
  onSpeedChange: (speed: number) => void
  onShowShortcuts: () => void
}

export function TransportControls({
  isPlaying,
  currentTime,
  currentFrame,
  duration,
  fps,
  speed,
  canPrevTagged,
  canNextTagged,
  onTogglePlay,
  onStepFrame,
  onPrevTagged,
  onNextTagged,
  onSpeedChange,
  onShowShortcuts,
}: TransportControlsProps) {
  return (
    <div className="flex h-[50px] shrink-0 items-center gap-3 border-t border-ink-700/80 bg-ink-900 px-3.5">
      <div className="flex items-center gap-0.5">
        <button
          className="icon-btn"
          onClick={onPrevTagged}
          disabled={!canPrevTagged}
          title="Previous tagged frame ([)"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          className="icon-btn"
          onClick={() => onStepFrame(-1)}
          title="Previous frame (←)"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={onTogglePlay}
          className={cn(
            'mx-1 flex h-8 w-10 items-center justify-center rounded-md border transition-colors',
            isPlaying
              ? 'border-accent/60 bg-accent text-[#1e1309] hover:bg-accent-bright'
              : 'border-accent/30 bg-accent/15 text-accent hover:border-accent/60 hover:bg-accent/25',
          )}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        >
          {isPlaying ? (
            <Pause className="h-3.5 w-3.5 fill-current" />
          ) : (
            <Play className="h-3.5 w-3.5 translate-x-[1px] fill-current" />
          )}
        </button>
        <button
          className="icon-btn"
          onClick={() => onStepFrame(1)}
          title="Next frame (→)"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          className="icon-btn"
          onClick={onNextTagged}
          disabled={!canNextTagged}
          title="Next tagged frame (])"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>

      <div className="h-5 w-px bg-ink-700" />

      <div className="flex min-w-0 items-baseline gap-2">
        <span className="timecode text-[12px] font-medium tabular-nums text-zinc-100">
          {formatTimecode(currentTime, fps)}
        </span>
        <span className="timecode text-[9px] text-zinc-600">/ {formatTimecode(duration, fps)}</span>
      </div>

      <div className="flex-1" />

      <div className="hidden items-center gap-1.5 sm:flex">
        <span className="text-[9px] uppercase tracking-wider text-zinc-600">Frame</span>
        <span className="timecode rounded border border-ink-700 bg-ink-850 px-1.5 py-0.5 text-[9.5px] text-zinc-400">
          {currentFrame}
        </span>
      </div>

      <div className="h-5 w-px bg-ink-700" />

      <label className="flex items-center gap-1.5">
        <span className="sr-only">Playback speed</span>
        <select
          value={speed}
          onChange={(event) => onSpeedChange(Number(event.target.value))}
          className="h-7 cursor-pointer rounded border border-ink-700 bg-ink-850 px-1.5 text-[9.5px] text-zinc-400 outline-none transition hover:border-ink-600 hover:text-zinc-200"
          title="Playback speed"
        >
          {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => (
            <option key={value} value={value}>
              {value}×
            </option>
          ))}
        </select>
      </label>

      <button
        className="icon-btn h-7 w-7"
        onClick={onShowShortcuts}
        title="Keyboard shortcuts (?)"
      >
        <Keyboard className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
