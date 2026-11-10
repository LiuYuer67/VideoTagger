import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Annotation, BoundingBox } from '../../types'
import {
  MIN_BOX_SIZE,
  annotationColor,
  boxStyle,
  moveBox,
  normalizeBox,
  resizeBox,
} from '../../utils/geometry'
import type { ResizeHandle } from '../../utils/geometry'
import { cn } from '../../utils/cn'

interface BoundingBoxOverlayProps {
  annotations: Annotation[]
  frame: number
  selectedId: string | null
  onSelect: (id: string | null) => void
  onCreate: (box: BoundingBox) => void
  onChange: (id: string, box: BoundingBox) => void
  onBeginInteraction: () => void
}

type Interaction =
  | {
      type: 'create'
      pointerId: number
      startX: number
      startY: number
      moved: boolean
    }
  | {
      type: 'move'
      pointerId: number
      id: string
      startX: number
      startY: number
      origin: BoundingBox
      moved: boolean
    }
  | {
      type: 'resize'
      pointerId: number
      id: string
      handle: ResizeHandle
      startX: number
      startY: number
      origin: BoundingBox
      moved: boolean
    }

const HANDLES: Array<{ id: ResizeHandle; className: string; cursor: string }> = [
  { id: 'nw', className: '-left-[5px] -top-[5px]', cursor: 'nwse-resize' },
  { id: 'n', className: 'left-1/2 -top-[5px] -translate-x-1/2', cursor: 'ns-resize' },
  { id: 'ne', className: '-right-[5px] -top-[5px]', cursor: 'nesw-resize' },
  { id: 'e', className: '-right-[5px] top-1/2 -translate-y-1/2', cursor: 'ew-resize' },
  { id: 'se', className: '-bottom-[5px] -right-[5px]', cursor: 'nwse-resize' },
  { id: 's', className: 'bottom-[-5px] left-1/2 -translate-x-1/2', cursor: 'ns-resize' },
  { id: 'sw', className: '-bottom-[5px] -left-[5px]', cursor: 'nesw-resize' },
  { id: 'w', className: '-left-[5px] top-1/2 -translate-y-1/2', cursor: 'ew-resize' },
]

export function BoundingBoxOverlay({
  annotations,
  frame,
  selectedId,
  onSelect,
  onCreate,
  onChange,
  onBeginInteraction,
}: BoundingBoxOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const interactionRef = useRef<Interaction | null>(null)
  const [draft, setDraft] = useState<BoundingBox | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const visible = useMemo(
    () =>
      annotations
        .map((annotation, index) => ({ annotation, index }))
        .filter((item) => item.annotation.frame_index === frame),
    [annotations, frame],
  )

  const pointFor = (event: ReactPointerEvent): { x: number; y: number } => {
    const rect = overlayRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 }
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    }
  }

  const finish = (event: ReactPointerEvent) => {
    const interaction = interactionRef.current
    if (!interaction) return
    if (overlayRef.current?.hasPointerCapture(event.pointerId)) {
      overlayRef.current.releasePointerCapture(event.pointerId)
    }
    if (interaction.type === 'create') {
      if (draft) {
        const rect = overlayRef.current?.getBoundingClientRect()
        const minW = rect ? 7 / rect.width : MIN_BOX_SIZE
        const minH = rect ? 7 / rect.height : MIN_BOX_SIZE
        if (draft.width >= minW && draft.height >= minH) {
          onCreate(draft)
        } else if (!interaction.moved) {
          onSelect(null)
        }
      }
    }
    interactionRef.current = null
    setDraft(null)
    setDraggingId(null)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    const point = pointFor(event)
    onBeginInteraction()

    const handleEl = target.closest<HTMLElement>('[data-resize-handle]')
    const boxEl = target.closest<HTMLElement>('[data-annotation-id]')
    const annotation = boxEl
      ? annotations.find((item) => item.id === boxEl.dataset.annotationId)
      : null
    if (annotation) onSelect(annotation.id)

    event.preventDefault()
    event.stopPropagation()
    overlayRef.current?.setPointerCapture(event.pointerId)

    if (annotation && handleEl && handleEl.dataset.resizeHandle) {
      interactionRef.current = {
        type: 'resize',
        pointerId: event.pointerId,
        id: annotation.id,
        handle: handleEl.dataset.resizeHandle as ResizeHandle,
        startX: point.x,
        startY: point.y,
        origin: { ...annotation.bbox },
        moved: false,
      }
      setDraggingId(annotation.id)
      return
    }
    if (annotation) {
      interactionRef.current = {
        type: 'move',
        pointerId: event.pointerId,
        id: annotation.id,
        startX: point.x,
        startY: point.y,
        origin: { ...annotation.bbox },
        moved: false,
      }
      setDraggingId(annotation.id)
      return
    }
    interactionRef.current = {
      type: 'create',
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      moved: false,
    }
    setDraft({ x: point.x, y: point.y, width: 0, height: 0 })
    onSelect(null)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current
    if (!interaction || interaction.pointerId !== event.pointerId) return
    const point = pointFor(event)
    const dx = point.x - interaction.startX
    const dy = point.y - interaction.startY
    if (!interaction.moved && (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001)) {
      interaction.moved = true
    }

    if (interaction.type === 'create') {
      setDraft(normalizeBox(interaction.startX, interaction.startY, point.x, point.y))
      return
    }
    if (!interaction.moved) return
    if (interaction.type === 'move') {
      onChange(interaction.id, moveBox(interaction.origin, dx, dy))
    } else {
      onChange(
        interaction.id,
        resizeBox(interaction.origin, interaction.handle, dx, dy),
      )
    }
  }

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current
    if (!interaction) return
    if (interaction.type !== 'create') {
      onChange(interaction.id, interaction.origin)
    }
    interactionRef.current = null
    setDraft(null)
    setDraggingId(null)
    if (overlayRef.current?.hasPointerCapture(event.pointerId)) {
      overlayRef.current.releasePointerCapture(event.pointerId)
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const interaction = interactionRef.current
      if (event.key !== 'Escape' || !interaction) return
      if (interaction.type !== 'create') {
        onChange(interaction.id, interaction.origin)
      }
      interactionRef.current = null
      setDraft(null)
      setDraggingId(null)
      event.stopPropagation()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onChange])

  return (
    <div
      ref={overlayRef}
      className={cn(
        'absolute inset-0 z-10 touch-none select-none',
        draft ? 'cursor-crosshair' : 'cursor-crosshair',
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finish}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={() => {
        if (interactionRef.current) {
          interactionRef.current = null
          setDraft(null)
          setDraggingId(null)
        }
      }}
      aria-hidden="true"
    >
      {visible.map(({ annotation, index }) => {
        const selected = annotation.id === selectedId
        const color = annotationColor(index)
        const labelBelow = annotation.bbox.y < 0.035
        return (
          <div
            key={annotation.id}
            data-annotation-id={annotation.id}
            className={cn(
              'group absolute border transition-shadow',
              selected
                ? 'z-20 border-2 shadow-[0_0_0_1px_rgba(0,0,0,.55),0_0_18px_rgba(245,154,75,.14)]'
                : 'z-10 border-[1.5px] hover:brightness-110',
              draggingId === annotation.id && 'cursor-move',
            )}
            style={{
              ...boxStyle(annotation.bbox),
              borderColor: selected ? '#ffb066' : color,
              backgroundColor: selected ? 'rgba(245,154,75,.08)' : `${color}10`,
              cursor: draggingId === annotation.id ? 'grabbing' : 'move',
            }}
          >
            <span
              className={cn(
                'pointer-events-none absolute left-0 top-0 flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-t-sm px-1.5 py-[2px] text-[9px] font-semibold leading-none text-[#17120c]',
                labelBelow ? 'translate-y-0' : '-translate-y-full',
              )}
              style={{ backgroundColor: selected ? '#ffb066' : color }}
            >
              <span>R{index + 1}</span>
              {annotation.tags.length > 0 && (
                <span className="opacity-65">{annotation.tags.length}t</span>
              )}
            </span>

            {selected &&
              HANDLES.map((handle) => (
                <span
                  key={handle.id}
                  role="presentation"
                  data-resize-handle={handle.id}
                  className={cn(
                    'absolute z-30 h-[9px] w-[9px] rounded-[2px] border border-[#23160a] bg-[#ffb066] shadow-sm',
                    handle.className,
                  )}
                  style={{ cursor: handle.cursor }}
                />
              ))}
          </div>
        )
      })}

      {draft && (
        <div
          className="pointer-events-none absolute z-30 border-2 border-dashed border-accent bg-accent/[0.08]"
          style={boxStyle(draft)}
        >
          <span className="absolute -top-5 left-0 rounded-sm bg-accent px-1.5 py-0.5 font-mono text-[8.5px] text-[#1b1208]">
            {Math.round(draft.width * 100)} × {Math.round(draft.height * 100)}%
          </span>
        </div>
      )}

      {visible.length === 0 && !draft && (
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded border border-white/10 bg-black/45 px-2 py-1.5 text-[9.5px] font-medium text-white/55 backdrop-blur-sm">
          <span className="inline-block h-2.5 w-2.5 rounded-sm border border-dashed border-white/40" />
          Drag on the frame to select a region
        </div>
      )}
    </div>
  )
}
