import { useMemo, useState } from 'react'
import { BarChart3, Check, Hash, Search, X } from 'lucide-react'
import { cn } from '../../utils/cn'

const LIST_HEIGHT = 512

interface TagLibraryProps {
  tags: string[]
  selectedTags: string[]
  usage: Map<string, number>
  canAdd: boolean
  onAdd: (tag: string) => void
}

export function TagLibrary({ tags, selectedTags, usage, canAdd, onAdd }: TagLibraryProps) {
  const [query, setQuery] = useState('')

  const selectedKeys = useMemo(
    () => new Set(selectedTags.map((tag) => tag.toLocaleLowerCase())),
    [selectedTags],
  )

  const entries = useMemo(() => {
    const q = query.trim().toLocaleLowerCase()
    return tags
      .map((tag) => {
        const key = tag.toLocaleLowerCase()
        return {
          tag,
          key,
          count: usage.get(key) ?? 0,
          already: selectedKeys.has(key),
        }
      })
      .filter((entry) => !q || entry.key.includes(q))
      .sort(
        (a, b) =>
          b.count - a.count ||
          a.tag.localeCompare(b.tag, undefined, { sensitivity: 'base' }),
      )
  }, [tags, query, usage, selectedKeys])

  return (
    <section className="border-t border-ink-700/80 bg-ink-900/20">
      <div className="flex items-center justify-between border-b border-ink-700/60 px-4 py-2.5">
        <div className="label flex items-center gap-1.5">
          <Hash className="h-3 w-3" />
          Tag library
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[8px] uppercase tracking-wider text-zinc-700">
            <BarChart3 className="h-2.5 w-2.5" />
            By occurrence
          </span>
          <span className="text-[8.5px] text-zinc-700">
            {query ? `${entries.length} of ${tags.length}` : `${tags.length} saved`}
          </span>
        </div>
      </div>

      <div className="border-b border-ink-700/60 p-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-600" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the tag library…"
            className="h-8 w-full rounded border border-ink-700 bg-ink-950/60 pl-8 pr-8 text-[10.5px] text-zinc-200 placeholder:text-zinc-700 focus:border-accent/50 focus:outline-none"
            aria-label="Search the tag library"
            spellCheck={false}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-zinc-600 transition hover:bg-white/5 hover:text-zinc-300"
              aria-label="Clear tag search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {!canAdd && (
        <div className="border-b border-ink-700/50 bg-ink-900/40 px-4 py-1.5 text-[8.5px] text-zinc-600">
          Select a region on the frame to add tags from the library.
        </div>
      )}

      {tags.length === 0 ? (
        <div className="flex h-[512px] flex-col items-center justify-center px-7 text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-ink-700 bg-ink-800">
            <Hash className="h-4 w-4 text-zinc-600" />
          </div>
          <div className="text-[11px] font-medium text-zinc-500">The library is empty</div>
          <p className="mt-1.5 max-w-[230px] text-[9.5px] leading-relaxed text-zinc-700">
            Tags you use are remembered here and sorted by how often they appear in the project.
          </p>
        </div>
      ) : entries.length === 0 ? (
        <div className="flex h-[512px] flex-col items-center justify-center gap-2 px-6 text-center">
          <Search className="h-5 w-5 text-zinc-700" />
          <div className="text-[10.5px] text-zinc-500">No tags match “{query.trim()}”.</div>
          <button
            type="button"
            onClick={() => setQuery('')}
            className="text-[9px] font-medium text-accent/80 transition hover:text-accent"
          >
            Clear search
          </button>
        </div>
      ) : (
        <div
          className="overflow-y-auto scroll-thin"
          style={{ height: LIST_HEIGHT }}
          role="list"
          aria-label="Saved tags"
        >
          <div className="flex content-start flex-wrap gap-1.5 p-3">
            {entries.map(({ tag, count, already }) => (
              <button
                key={tag}
                type="button"
                role="listitem"
                disabled={!canAdd || already}
                onClick={() => onAdd(tag)}
                title={
                  already
                    ? `Already added · used in ${count} region${count === 1 ? '' : 's'}`
                    : canAdd
                      ? `Add “${tag}” · used in ${count} region${count === 1 ? '' : 's'}`
                      : `Used in ${count} region${count === 1 ? '' : 's'}`
                }
                className={cn(
                  'inline-flex h-[25px] max-w-full items-center gap-1 rounded border px-1.5 text-[9.5px] transition-colors',
                  already
                    ? 'cursor-default border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400/70'
                    : canAdd
                      ? 'border-ink-700 bg-ink-900/70 text-zinc-400 hover:border-accent/35 hover:bg-accent/[0.07] hover:text-accent-bright'
                      : 'cursor-default border-ink-700 bg-ink-900/40 text-zinc-600',
                )}
              >
                {already ? (
                  <Check className="h-2.5 w-2.5 shrink-0 opacity-70" />
                ) : (
                  <Hash className="h-2.5 w-2.5 shrink-0 opacity-40" />
                )}
                <span className="max-w-[180px] truncate">{tag}</span>
                <span
                  className={cn(
                    'timecode shrink-0 rounded px-1 py-[1px] text-[7.5px]',
                    already
                      ? 'bg-emerald-500/10 text-emerald-400/60'
                      : count > 0
                        ? 'bg-ink-750 text-zinc-500'
                        : 'bg-ink-800/70 text-zinc-700',
                  )}
                >
                  {count}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex h-7 items-center justify-between border-t border-ink-700/60 bg-ink-900/40 px-4 text-[8px] text-zinc-700">
        <span>{entries.length} tags</span>
        <span>{canAdd ? 'Click a tag to apply it' : 'Select a region first'}</span>
      </div>
    </section>
  )
}
