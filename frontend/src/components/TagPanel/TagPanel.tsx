import { useMemo, useState } from 'react'
import {
  BoxSelect,
  Clock3,
  Copy,
  Hash,
  Layers,
  MousePointer2,
  Pencil,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import { useProjectStore } from '../../stores/projectStore'
import { annotationColor } from '../../utils/geometry'
import { formatTimecode } from '../../utils/time'
import { cn } from '../../utils/cn'
import { TagInput } from './TagInput'
import { TagLibrary } from './TagLibrary'

export function TagPanel() {
  const project = useProjectStore((state) => state.project)
  const video = useProjectStore((state) => state.video)
  const selectedId = useProjectStore((state) => state.selectedAnnotationId)
  const currentFrame = useProjectStore((state) => state.currentFrame)
  const globalTags = useProjectStore((state) => state.globalTags)
  const selectAnnotation = useProjectStore((state) => state.selectAnnotation)
  const deleteAnnotation = useProjectStore((state) => state.deleteAnnotation)
  const addTags = useProjectStore((state) => state.addTagsToAnnotation)
  const removeTag = useProjectStore((state) => state.removeTagFromAnnotation)
  const useLastTags = useProjectStore((state) => state.useLastTags)
  const setUseLastTags = useProjectStore((state) => state.setUseLastTags)
  const [seed, setSeed] = useState<string | null>(null)

  const annotations = project?.annotations ?? []

  const frameAnnotations = useMemo(
    () => annotations.filter((annotation) => annotation.frame_index === currentFrame),
    [annotations, currentFrame],
  )

  const selected = useMemo(
    () => annotations.find((annotation) => annotation.id === selectedId) ?? null,
    [annotations, selectedId],
  )
  const selectedIndex = selected
    ? annotations.findIndex((annotation) => annotation.id === selected.id)
    : -1
  const selectedColor = selectedIndex >= 0 ? annotationColor(selectedIndex) : '#f59a4b'
  const fps = video?.fps || 30
  const totalTags = useMemo(
    () => annotations.reduce((count, annotation) => count + annotation.tags.length, 0),
    [annotations],
  )
  const tagUsage = useMemo(() => {
    const counts = new Map<string, number>()
    for (const annotation of annotations) {
      const seen = new Set<string>()
      for (const tag of annotation.tags) {
        const key = tag.toLocaleLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
    return counts
  }, [annotations])

  const handleEditTag = (tag: string) => {
    if (!selected) return
    removeTag(selected.id, tag)
    setSeed(tag)
  }

  return (
    <aside className="flex w-[max(320px,25vw)] shrink-0 flex-col border-l border-ink-700/80 bg-ink-850">
      <div className="flex h-[42px] shrink-0 items-center justify-between border-b border-ink-700/80 px-4">
        <div className="flex items-center gap-2">
          <Tag className="h-3.5 w-3.5 text-zinc-500" />
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-zinc-400">
            Tag panel
          </span>
        </div>
        <div className="flex items-center gap-2 text-[9px] text-zinc-600">
          <span>{annotations.length} regions</span>
          <span className="h-3 w-px bg-ink-700" />
          <span>{totalTags} tags</span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scroll-thin">
        <div className="grid grid-cols-[1fr_auto] items-center border-b border-ink-700/70 bg-ink-900/55 px-4 py-3">
          <div>
            <div className="label mb-1">Current frame</div>
            <div className="timecode text-[17px] font-medium leading-none text-zinc-100">
              {formatTimecode(currentFrame / fps, fps)}
            </div>
          </div>
          <div className="text-right">
            <div className="label mb-1">Index</div>
            <div className="timecode text-[12px] text-zinc-400">
              F<span className="text-zinc-200">{currentFrame}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-b border-ink-700/70 bg-ink-900/30 px-4 py-2">
          <button
            type="button"
            role="switch"
            aria-checked={useLastTags}
            onClick={() => setUseLastTags(!useLastTags)}
            className="flex min-w-0 items-center gap-2.5 text-left"
            title="New bounding boxes copy tags from the first region on the current frame, otherwise the nearest previous tagged frame."
          >
            <span
              className={cn(
                'relative h-[16px] w-[28px] shrink-0 rounded-full border transition-colors',
                useLastTags
                  ? 'border-accent/60 bg-accent/35'
                  : 'border-ink-600 bg-ink-800',
              )}
            >
              <span
                className={cn(
                  'absolute top-[2px] h-[10px] w-[10px] rounded-full transition-all',
                  useLastTags ? 'left-[14px] bg-accent-bright' : 'left-[2px] bg-zinc-500',
                )}
              />
            </span>
            <span className="min-w-0">
              <span
                className={cn(
                  'flex items-center gap-1.5 text-[10px] font-medium',
                  useLastTags ? 'text-zinc-200' : 'text-zinc-400',
                )}
              >
                <Copy className="h-2.5 w-2.5" />
                Use last tags
              </span>
              <span className="mt-0.5 block truncate text-[8px] text-zinc-600">
                New boxes copy the previous region&apos;s tags
              </span>
            </span>
          </button>
          <span
            className={cn(
              'shrink-0 text-[8px] font-semibold uppercase tracking-wider',
              useLastTags ? 'text-accent' : 'text-zinc-700',
            )}
          >
            {useLastTags ? 'On' : 'Off'}
          </span>
        </div>

        <section className="border-b border-ink-700/70 px-4 py-3.5">
          <div className="mb-2.5 flex items-center justify-between">
            <div className="label flex items-center gap-1.5">
              <Layers className="h-3 w-3" />
              Regions on this frame
            </div>
            <span className="text-[9px] text-zinc-600">{frameAnnotations.length}</span>
          </div>

          {frameAnnotations.length === 0 ? (
            <div className="rounded-md border border-dashed border-ink-650 bg-ink-900/40 px-3 py-3 text-[10.5px] leading-relaxed text-zinc-600">
              No tagged regions on this frame. Pause and drag on the video to create one.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {frameAnnotations.map((annotation) => {
                const index = annotations.findIndex((item) => item.id === annotation.id)
                const active = annotation.id === selectedId
                return (
                  <button
                    key={annotation.id}
                    onClick={() => selectAnnotation(annotation.id)}
                    className={cn(
                      'group flex min-w-[58px] items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors',
                      active
                        ? 'border-accent/50 bg-accent/10'
                        : 'border-ink-700 bg-ink-900/60 hover:border-ink-600 hover:bg-ink-800',
                    )}
                    title={`Select region R${index + 1}`}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-[1px]"
                      style={{ backgroundColor: annotationColor(index) }}
                    />
                    <span className="min-w-0">
                      <span
                        className={cn(
                          'block text-[9.5px] font-semibold',
                          active ? 'text-zinc-100' : 'text-zinc-400',
                        )}
                      >
                        R{index + 1}
                      </span>
                      <span className="block text-[8px] text-zinc-600">
                        {annotation.tags.length} tag{annotation.tags.length === 1 ? '' : 's'}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {selected ? (
          <div className="flex flex-col">
            <div className="border-b border-ink-700/70 px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded border text-[10px] font-bold"
                    style={{
                      borderColor: `${selectedColor}55`,
                      backgroundColor: `${selectedColor}14`,
                      color: selectedColor,
                    }}
                  >
                    R{selectedIndex + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[11.5px] font-medium text-zinc-200">
                      Region {selectedIndex + 1}
                    </div>
                    <div className="mt-0.5 text-[9px] text-zinc-600">
                      {selected.tags.length} tag{selected.tags.length === 1 ? '' : 's'} · frame{' '}
                      {selected.frame_index}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => deleteAnnotation(selected.id)}
                  className="icon-btn h-7 w-7 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
                  title="Delete region (Delete)"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-1.5">
                {[
                  { label: 'X', value: selected.bbox.x },
                  { label: 'Y', value: selected.bbox.y },
                  { label: 'W', value: selected.bbox.width },
                  { label: 'H', value: selected.bbox.height },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded border border-ink-700/80 bg-ink-900/50 px-1.5 py-1.5"
                  >
                    <div className="text-[7.5px] uppercase tracking-wider text-zinc-600">
                      {item.label}
                    </div>
                    <div className="timecode mt-0.5 text-[9.5px] text-zinc-400">
                      {(item.value * 100).toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-b border-ink-700/70 px-4 py-3.5">
              <div className="mb-2 flex items-center justify-between">
                <div className="label flex items-center gap-1.5">
                  <Hash className="h-3 w-3" />
                  Tags
                </div>
                <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[8.5px] text-zinc-500">
                  {selected.tags.length}
                </span>
              </div>

              {selected.tags.length > 0 ? (
                <div className="mb-2.5 flex flex-wrap gap-1.5">
                  {selected.tags.map((tag) => (
                    <span
                      key={tag}
                      className="group inline-flex h-[25px] max-w-full items-center gap-1 rounded border border-ink-600 bg-ink-750 pl-2 pr-0.5 text-[10.5px] text-zinc-200 transition-colors hover:border-ink-500"
                    >
                      <span
                        className="cursor-text truncate"
                        title="Double-click to edit this tag"
                        onDoubleClick={() => handleEditTag(tag)}
                      >
                        {tag}
                      </span>
                      <button
                        onClick={() => removeTag(selected.id, tag)}
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-zinc-500 transition hover:bg-red-500/15 hover:text-red-300"
                        title={`Remove ${tag}`}
                        aria-label={`Remove tag ${tag}`}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <div className="mb-2.5 flex items-center gap-2 rounded border border-dashed border-ink-700 px-2.5 py-2 text-[10px] text-zinc-600">
                  <Pencil className="h-3 w-3" />
                  No tags yet. Type below, separated by commas.
                </div>
              )}

              <TagInput
                annotation={selected}
                seed={seed}
                onSeedConsumed={() => setSeed(null)}
                onAddTags={(tags) => addTags(selected.id, tags)}
              />
              <div className="mt-2 flex items-center justify-between px-0.5 text-[8.5px] text-zinc-700">
                <span>Comma or Enter adds a tag</span>
                <span className="inline-flex items-center gap-1">
                  <span className="kbd">Tab</span>
                  autocomplete
                </span>
              </div>
            </div>

          </div>
        ) : (
          <div className="flex flex-col items-center justify-center px-7 py-8 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-ink-700 bg-ink-800/70">
              <BoxSelect className="h-5 w-5 text-zinc-600" />
            </div>
            <div className="text-[12.5px] font-medium text-zinc-400">No region selected</div>
            <p className="mt-2 max-w-[230px] text-[10.5px] leading-relaxed text-zinc-600">
              {frameAnnotations.length > 0
                ? 'Select a region above to edit its tags, or draw another box on the frame.'
                : 'Pause the video and drag over the frame to draw your first crop region.'}
            </p>
            <div className="mt-5 flex flex-col gap-2 text-left text-[9.5px] text-zinc-600">
              <span className="flex items-center gap-2">
                <MousePointer2 className="h-3 w-3 text-zinc-700" />
                Drag to create · move or resize with handles
              </span>
              <span className="flex items-center gap-2">
                <Clock3 className="h-3 w-3 text-zinc-700" />
                Frame-step with ← / →
              </span>
            </div>
          </div>
        )}

        <TagLibrary
          tags={globalTags}
          selectedTags={selected?.tags ?? []}
          usage={tagUsage}
          canAdd={Boolean(selected)}
          onAdd={(tag) => {
            if (!selected) return
            addTags(selected.id, [tag])
          }}
        />
      </div>

      <div className="flex h-[34px] shrink-0 items-center justify-between border-t border-ink-700/80 bg-ink-900/50 px-4 text-[8.5px] text-zinc-700">
        <span className="inline-flex items-center gap-1">
          <span className="kbd">Del</span>
          delete region
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="kbd">Esc</span>
          deselect
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="kbd">Space</span>
          play
        </span>
      </div>
    </aside>
  )
}
