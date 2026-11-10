import type { Annotation, BoundingBox } from '../types'
import { clamp } from './time'

export const MIN_BOX_SIZE = 0.004

export function normalizeBox(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): BoundingBox {
  const x = clamp(Math.min(startX, endX), 0, 1)
  const y = clamp(Math.min(startY, endY), 0, 1)
  const right = clamp(Math.max(startX, endX), 0, 1)
  const bottom = clamp(Math.max(startY, endY), 0, 1)
  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
  }
}

export function boxesAtFrame(annotations: Annotation[], frame: number): Annotation[] {
  return annotations.filter((annotation) => annotation.frame_index === frame)
}

export function groupByFrame(annotations: Annotation[]): Map<number, Annotation[]> {
  const map = new Map<number, Annotation[]>()
  for (const annotation of annotations) {
    const list = map.get(annotation.frame_index)
    if (list) list.push(annotation)
    else map.set(annotation.frame_index, [annotation])
  }
  return map
}

export function moveBox(box: BoundingBox, dx: number, dy: number): BoundingBox {
  const x = clamp(box.x + dx, 0, 1 - box.width)
  const y = clamp(box.y + dy, 0, 1 - box.height)
  return { ...box, x, y }
}

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export function resizeBox(
  box: BoundingBox,
  handle: ResizeHandle,
  dx: number,
  dy: number,
): BoundingBox {
  let left = box.x
  let top = box.y
  let right = box.x + box.width
  let bottom = box.y + box.height

  if (handle.includes('w')) left = clamp(left + dx, 0, right - MIN_BOX_SIZE)
  if (handle.includes('e')) right = clamp(right + dx, left + MIN_BOX_SIZE, 1)
  if (handle.includes('n')) top = clamp(top + dy, 0, bottom - MIN_BOX_SIZE)
  if (handle.includes('s')) bottom = clamp(bottom + dy, top + MIN_BOX_SIZE, 1)

  return {
    x: left,
    y: top,
    width: Math.max(MIN_BOX_SIZE, right - left),
    height: Math.max(MIN_BOX_SIZE, bottom - top),
  }
}

const BOX_COLORS = ['#f2a154', '#61b9d0', '#b394f6', '#70d7aa', '#ee7ca8', '#e6c95c']

export function annotationColor(index: number): string {
  return BOX_COLORS[index % BOX_COLORS.length]
}

export function boxStyle(box: BoundingBox) {
  return {
    left: `${box.x * 100}%`,
    top: `${box.y * 100}%`,
    width: `${box.width * 100}%`,
    height: `${box.height * 100}%`,
  }
}
