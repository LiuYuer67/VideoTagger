import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Film, Maximize2, Minus, Plus, Tag } from 'lucide-react'
import type { Annotation, VideoInfo } from '../../types'
import { useProjectStore } from '../../stores/projectStore'
import { groupByFrame } from '../../utils/geometry'
import { clamp } from '../../utils/time'
import { cn } from '../../utils/cn'

interface TimelineProps {
  video: VideoInfo
  annotations: Annotation[]
  selectedAnnotationId: string | null
  onSeekTime: (time: number) => void
  onJumpToFrame: (frame: number) => void
}

interface Interaction {
  type: 'pan' | 'seek'
  pointerId: number
  startX: number
  startView: number
  moved: boolean
}

const CANVAS_HEIGHT = 78
const RULER_HEIGHT = 17
const MARKER_HEIGHT = 13

function niceStep(span: number, width: number): number {
  const target = Math.max(0.02, span / Math.max(1, width / 95))
  const steps = [
    0.04, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200,
  ]
  return steps.find((step) => step >= target) ?? 7200
}

function tickLabel(time: number, step: number): string {
  const whole = Math.floor(time)
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const s = whole % 60
  if (step < 1) {
    const digits = step < 0.1 ? 2 : 1
    const fraction = Math.round((time - whole) * 10 ** digits)
      .toString()
      .padStart(digits, '0')
    return `${m}:${s.toString().padStart(2, '0')}.${fraction}`
  }
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

function TimelinePlayhead({
  duration,
  fps,
  viewStart,
  viewEnd,
  width,
  setViewRange,
}: {
  duration: number
  fps: number
  viewStart: number
  viewEnd: number
  width: number
  setViewRange: (start: number, end: number) => void
}) {
  const currentTime = useProjectStore((state) => state.currentTime)
  const isPlaying = useProjectStore((state) => state.isPlaying)
  const span = Math.max(0.001, viewEnd - viewStart)
  const x = ((currentTime - viewStart) / span) * width
  const visible = x >= 0 && x <= width

  useEffect(() => {
    if (!isPlaying || span >= duration - 0.001) return
    if (currentTime >= viewStart && currentTime <= viewEnd) return
    const nextSpan = Math.min(span, duration)
    const nextStart =
      currentTime > viewEnd
        ? clamp(currentTime - nextSpan * 0.08, 0, duration - nextSpan)
        : clamp(currentTime - nextSpan * 0.92, 0, duration - nextSpan)
    setViewRange(nextStart, nextStart + nextSpan)
    // The effect intentionally follows only time changes while playing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, isPlaying])

  if (!visible) return null
  return (
    <div
      className="pointer-events-none absolute bottom-0 top-0 z-40"
      style={{ left: x }}
      data-timeline-playhead
    >
      <div className="absolute bottom-0 top-0 w-px bg-accent shadow-[0_0_9px_rgba(245,154,75,.35)]" />
      <div
        className="absolute top-0 h-[8px] w-[9px] -translate-x-1/2"
        style={{
          background: '#f59a4b',
          clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
        }}
      />
      <button
        type="button"
        data-playhead-handle
        className="pointer-events-auto absolute -left-[5px] -top-[2px] h-4 w-[11px] cursor-ew-resize"
        aria-label="Drag playhead"
        title="Drag to seek"
      >
        <span className="sr-only">Playhead</span>
      </button>
      <span className="absolute bottom-[15px] left-1.5 whitespace-nowrap font-mono text-[8px] text-accent/80">
        {(currentTime * fps).toFixed(0)}f
      </span>
    </div>
  )
}

export function Timeline({
  video,
  annotations,
  selectedAnnotationId,
  onSeekTime,
  onJumpToFrame,
}: TimelineProps) {
  const viewStart = useProjectStore((state) => state.viewStart)
  const viewEnd = useProjectStore((state) => state.viewEnd)
  const setViewRange = useProjectStore((state) => state.setViewRange)
  const resetView = useProjectStore((state) => state.resetView)
  const viewportRef = useRef<HTMLDivElement>(null)
  const interactionRef = useRef<Interaction | null>(null)
  const [width, setWidth] = useState(0)
  const [isPanning, setIsPanning] = useState(false)
  const [hover, setHover] = useState<{ x: number; time: number } | null>(null)

  const duration = video.duration
  const minSpan = Math.min(duration, Math.max(0.4, duration / 32))
  const span = Math.max(0.001, viewEnd - viewStart)
  const zoom = duration / span
  const selectedFrame = useMemo(() => {
    const annotation = annotations.find((item) => item.id === selectedAnnotationId)
    return annotation?.frame_index ?? null
  }, [annotations, selectedAnnotationId])

  const grouped = useMemo(() => groupByFrame(annotations), [annotations])
  const markers = useMemo(
    () =>
      [...grouped.entries()]
        .map(([frame, items]) => ({
          frame,
          time: frame / video.fps,
          tags: items.reduce((sum, item) => sum + item.tags.length, 0),
          count: items.length,
        }))
        .sort((a, b) => a.frame - b.frame),
    [grouped, video.fps],
  )

  const step = niceStep(span, width || 900)
  const ticks = useMemo(() => {
    const result: number[] = []
    const first = Math.ceil((viewStart - 1e-9) / step) * step
    for (let value = first; value <= viewEnd + 1e-9; value += step) {
      result.push(Number(value.toFixed(6)))
    }
    return result
  }, [viewStart, viewEnd, step])

  useLayoutEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const update = () => setWidth(element.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const timeToX = (time: number) => ((time - viewStart) / span) * width
  const xToTime = (x: number) => clamp(viewStart + (x / Math.max(1, width)) * span, 0, duration)

  const zoomAt = (factor: number, anchorRatio: number) => {
    if (width <= 0) return
    const anchorTime = viewStart + anchorRatio * span
    const nextSpan = clamp(span / factor, minSpan, duration)
    const nextStart = clamp(anchorTime - anchorRatio * nextSpan, 0, duration - nextSpan)
    setViewRange(nextStart, nextStart + nextSpan)
  }

  useEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      const ratio = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1)
      const factor = Math.exp(-event.deltaY / 500)
      zoomAt(factor, ratio)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  })

  const pointerTime = (event: ReactPointerEvent) => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return 0
    return xToTime(clamp(event.clientX - rect.left, 0, rect.width))
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('[data-timeline-marker]')) return
    const isPlayhead = Boolean(target.closest('[data-playhead-handle]'))
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    event.preventDefault()
    viewportRef.current?.setPointerCapture(event.pointerId)
    if (isPlayhead) {
      interactionRef.current = {
        type: 'seek',
        pointerId: event.pointerId,
        startX: event.clientX,
        startView: viewStart,
        moved: false,
      }
      onSeekTime(pointerTime(event))
      return
    }
    interactionRef.current = {
      type: 'pan',
      pointerId: event.pointerId,
      startX: event.clientX,
      startView: viewStart,
      moved: false,
    }
    setIsPanning(true)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (rect) {
      const x = clamp(event.clientX - rect.left, 0, rect.width)
      setHover({ x, time: xToTime(x) })
    }
    const interaction = interactionRef.current
    if (!interaction || interaction.pointerId !== event.pointerId) return
    const dx = event.clientX - interaction.startX
    if (Math.abs(dx) > 3) interaction.moved = true
    if (interaction.type === 'seek') {
      onSeekTime(pointerTime(event))
      return
    }
    if (!interaction.moved) return
    const deltaTime = (-dx / Math.max(1, width)) * span
    const nextStart = clamp(interaction.startView + deltaTime, 0, Math.max(0, duration - span))
    setViewRange(nextStart, nextStart + span)
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current
    if (!interaction) return
    if (interaction.type === 'pan' && !interaction.moved) {
      onSeekTime(pointerTime(event))
    }
    interactionRef.current = null
    setIsPanning(false)
    if (viewportRef.current?.hasPointerCapture(event.pointerId)) {
      viewportRef.current.releasePointerCapture(event.pointerId)
    }
  }

  const handlePointerLeave = () => {
    if (!interactionRef.current) setHover(null)
  }

  const thumbnails = video.thumbnails
  const thumbnailSegments = useMemo(() => {
    if (!thumbnails.length) return []
    return thumbnails
      .map((thumb, index) => {
        const previous = thumbnails[index - 1]?.time ?? 0
        const next = thumbnails[index + 1]?.time ?? duration
        const start = index === 0 ? 0 : (previous + thumb.time) / 2
        const end = index === thumbnails.length - 1 ? duration : (thumb.time + next) / 2
        return { ...thumb, start, end }
      })
      .filter((thumb) => thumb.end >= viewStart && thumb.start <= viewEnd)
  }, [thumbnails, duration, viewStart, viewEnd])

  return (
    <section className="flex h-[128px] shrink-0 flex-col border-t border-ink-700/80 bg-[#0c0f13]">
      <div className="flex h-[34px] shrink-0 items-center justify-between border-b border-ink-700/60 px-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            <Film className="h-3 w-3" />
            Timeline
          </span>
          <span className="h-3 w-px bg-ink-700" />
          <span className="timecode text-[9.5px] text-zinc-600">
            {tickLabel(viewStart, 1)} – {tickLabel(viewEnd, 1)}
          </span>
          {markers.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[9px] text-cyan-400/60">
              <span className="h-1.5 w-1.5 rotate-45 bg-cyan-400/70" />
              {markers.length} tagged {markers.length === 1 ? 'frame' : 'frames'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="hidden text-[8.5px] text-zinc-700 lg:inline">
            Ctrl+wheel zoom · drag to pan
          </span>
          <div className="flex items-center rounded border border-ink-700 bg-ink-850">
            <button
              className="flex h-6 w-6 items-center justify-center text-zinc-500 transition hover:bg-ink-750 hover:text-zinc-200 disabled:opacity-30"
              onClick={() => zoomAt(1 / 1.5, 0.5)}
              disabled={span >= duration - 0.001}
              title="Zoom out"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="timecode min-w-[38px] border-x border-ink-700 px-1.5 text-center text-[9px] text-zinc-500">
              {zoom < 10 ? `${zoom.toFixed(zoom < 2 ? 2 : 1)}×` : `${Math.round(zoom)}×`}
            </span>
            <button
              className="flex h-6 w-6 items-center justify-center text-zinc-500 transition hover:bg-ink-750 hover:text-zinc-200 disabled:opacity-30"
              onClick={() => zoomAt(1.5, 0.5)}
              disabled={span <= minSpan + 0.001}
              title="Zoom in"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <button
            className="flex h-6 items-center gap-1 rounded border border-ink-700 bg-ink-850 px-1.5 text-[9px] text-zinc-500 transition hover:border-ink-600 hover:text-zinc-200 disabled:opacity-30"
            onClick={resetView}
            disabled={span >= duration - 0.001 && viewStart <= 0.001}
            title="Fit whole video"
          >
            <Maximize2 className="h-2.5 w-2.5" />
            Fit
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className={cn(
          'relative mx-2.5 mb-2 mt-1.5 flex-1 touch-none select-none overflow-hidden rounded border border-ink-700/80 bg-[#080a0d]',
          isPanning ? 'cursor-grabbing' : 'cursor-crosshair',
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        role="slider"
        aria-label="Video timeline"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={0}
      >
        {width > 0 && (
          <>
            <div
              className="absolute left-0 right-0 top-0 border-b border-ink-700/60 bg-[#0b0e12]"
              style={{ height: RULER_HEIGHT }}
            >
              {ticks.map((tick) => (
                <div
                  key={tick}
                  className="absolute top-0 h-full"
                  style={{ left: timeToX(tick) }}
                >
                  <span className="absolute top-[3px] whitespace-nowrap pl-1 font-mono text-[8px] text-zinc-600">
                    {tickLabel(tick, step)}
                  </span>
                  <span className="absolute bottom-0 h-[3px] w-px bg-ink-600" />
                </div>
              ))}
            </div>

            <div
              className="absolute left-0 right-0 overflow-hidden"
              style={{ top: RULER_HEIGHT, height: CANVAS_HEIGHT - RULER_HEIGHT - MARKER_HEIGHT }}
            >
              {thumbnailSegments.length > 0 ? (
                thumbnailSegments.map((thumb) => {
                  const left = timeToX(thumb.start)
                  const right = timeToX(thumb.end)
                  return (
                    <div
                      key={thumb.index}
                      className="absolute top-0 h-full overflow-hidden border-r border-black/60"
                      style={{ left, width: Math.max(1, right - left) }}
                    >
                      <img
                        src={thumb.url}
                        alt=""
                        draggable={false}
                        className="h-full w-full object-cover opacity-[0.88]"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                  )
                })
              ) : (
                <div className="flex h-full items-center justify-center gap-2 text-[9px] text-zinc-700">
                  <Film className="h-3 w-3" />
                  Generating filmstrip…
                </div>
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/30" />
              <div className="timeline-track pointer-events-none absolute inset-0 opacity-40" />
            </div>

            <div
              className="absolute left-0 right-0 bottom-0 border-t border-ink-800 bg-[#0a0c0f]"
              style={{ height: MARKER_HEIGHT }}
            >
              {markers.map((marker) => {
                const x = timeToX(marker.time)
                if (x < -4 || x > width + 4) return null
                return (
                  <button
                    key={marker.frame}
                    type="button"
                    data-timeline-marker
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation()
                      onJumpToFrame(marker.frame)
                    }}
                    className={cn(
                      'group absolute bottom-0 top-0 z-30 -translate-x-1/2 px-[3px]',
                      selectedFrame === marker.frame && 'z-40',
                    )}
                    style={{ left: x }}
                    title={`Frame ${marker.frame} · ${marker.count} region${
                      marker.count === 1 ? '' : 's'
                    }${marker.tags ? ` · ${marker.tags} tags` : ''}`}
                  >
                    <span
                      className={cn(
                        'absolute bottom-[2px] left-1/2 h-[5px] w-[5px] -translate-x-1/2 rotate-45 border transition-colors',
                        selectedFrame === marker.frame
                          ? 'border-accent bg-accent'
                          : 'border-cyan-400/80 bg-cyan-400/50 group-hover:bg-cyan-300',
                      )}
                    />
                    <span
                      className={cn(
                        'absolute bottom-[2px] left-1/2 w-px -translate-x-1/2',
                        selectedFrame === marker.frame ? 'bg-accent/70' : 'bg-cyan-400/30',
                      )}
                      style={{ height: CANVAS_HEIGHT - RULER_HEIGHT - MARKER_HEIGHT }}
                    />
                  </button>
                )
              })}
            </div>

            {hover && !isPanning && !interactionRef.current && (
              <>
                <div
                  className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-white/15"
                  style={{ left: hover.x }}
                />
                <div
                  className="pointer-events-none absolute top-[19px] z-40 -translate-x-1/2 whitespace-nowrap rounded border border-ink-600 bg-ink-850/95 px-1.5 py-0.5 font-mono text-[8px] text-zinc-300 shadow-panel"
                  style={{ left: clamp(hover.x, 28, Math.max(28, width - 28)) }}
                >
                  {tickLabel(hover.time, 0.1)}
                </div>
              </>
            )}

            <div className="pointer-events-none absolute inset-0 z-20">
              <TimelinePlayhead
                duration={duration}
                fps={video.fps}
                viewStart={viewStart}
                viewEnd={viewEnd}
                width={width}
                setViewRange={setViewRange}
              />
            </div>

            <div className="pointer-events-none absolute right-1.5 top-[2px] z-10 flex items-center gap-1 rounded-sm bg-black/30 px-1 py-0.5 text-[7.5px] text-zinc-600">
              <Tag className="h-2 w-2" />
              tagged frames
            </div>
          </>
        )}
      </div>
    </section>
  )
}
