import { useEffect, useMemo, useRef, useState } from 'react'
import { CornerDownLeft, Hash, Plus, Sparkles } from 'lucide-react'
import type { Annotation } from '../../types'
import { useProjectStore } from '../../stores/projectStore'
import { filterSuggestions, normalizeTag, splitTagInput } from '../../utils/tags'
import { cn } from '../../utils/cn'

interface TagInputProps {
  annotation: Annotation
  seed: string | null
  onSeedConsumed: () => void
  onAddTags: (tags: string[]) => void
}

export function TagInput({ annotation, seed, onSeedConsumed, onAddTags }: TagInputProps) {
  const globalTags = useProjectStore((state) => state.globalTags)
  const [value, setValue] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [navigated, setNavigated] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const suggestions = useMemo(
    () => filterSuggestions(globalTags, value, annotation.tags, 7),
    [globalTags, value, annotation.tags],
  )

  useEffect(() => {
    setValue('')
    setOpen(false)
    setHighlight(0)
    setNavigated(false)
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20)
    return () => window.clearTimeout(timer)
  }, [annotation.id])

  useEffect(() => {
    if (seed === null) return
    setValue(seed)
    setOpen(true)
    setHighlight(0)
    setNavigated(false)
    window.setTimeout(() => inputRef.current?.focus(), 20)
    onSeedConsumed()
  }, [seed, onSeedConsumed])

  useEffect(() => {
    if (highlight >= suggestions.length) {
      setHighlight(Math.max(0, suggestions.length - 1))
    }
  }, [suggestions.length, highlight])

  const accept = (tag: string) => {
    const normalized = normalizeTag(tag)
    if (normalized) onAddTags([normalized])
    setValue('')
    setOpen(false)
    setHighlight(0)
    setNavigated(false)
    inputRef.current?.focus()
  }

  const commitTyped = () => {
    const normalized = normalizeTag(value)
    if (!normalized) return
    onAddTags([normalized])
    setValue('')
    setOpen(false)
    setHighlight(0)
    setNavigated(false)
  }

  const handleChange = (raw: string) => {
    const { complete, partial } = splitTagInput(raw)
    if (complete.length > 0) {
      onAddTags(complete)
      setValue(partial)
      setOpen(true)
      setHighlight(0)
      setNavigated(false)
      return
    }
    setValue(raw)
    setOpen(true)
    setHighlight(0)
    setNavigated(false)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'ArrowDown') {
      if (!suggestions.length) return
      event.preventDefault()
      setOpen(true)
      setNavigated(true)
      setHighlight((current) => (current + 1) % suggestions.length)
      return
    }
    if (event.key === 'ArrowUp') {
      if (!suggestions.length) return
      event.preventDefault()
      setOpen(true)
      setNavigated(true)
      setHighlight((current) => (current - 1 + suggestions.length) % suggestions.length)
      return
    }
    if (event.key === 'Tab') {
      if (!open || !suggestions.length) return
      event.preventDefault()
      accept(suggestions[Math.min(highlight, suggestions.length - 1)])
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (open && navigated && suggestions.length > 0) {
        accept(suggestions[Math.min(highlight, suggestions.length - 1)])
      } else {
        commitTyped()
      }
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (open) {
        setOpen(false)
      } else {
        inputRef.current?.blur()
      }
    }
  }

  const showSuggestions = open && suggestions.length > 0 && value.trim().length > 0

  return (
    <div className="relative">
      <div
        className={cn(
          'flex min-h-[42px] items-center gap-2 rounded-md border bg-ink-900 px-2.5 transition-colors',
          'border-ink-650 focus-within:border-accent/60 hover:border-ink-600',
        )}
      >
        <Hash className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          placeholder="person, red shirt, outdoor…"
          className="h-10 min-w-0 flex-1 bg-transparent text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          spellCheck={false}
          autoComplete="off"
          aria-label="Add tags"
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
        />
        <span className="hidden shrink-0 items-center gap-1 text-[8.5px] text-zinc-700 sm:flex">
          <span className="kbd">Tab</span>
          accept
        </span>
        <button
          type="button"
          onClick={commitTyped}
          disabled={!value.trim()}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-ink-700 text-zinc-500 transition hover:border-accent/40 hover:bg-accent/10 hover:text-accent disabled:opacity-30"
          title="Add tag (Enter)"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {showSuggestions && (
        <div
          className="absolute left-0 right-0 top-[calc(100%+5px)] z-40 overflow-hidden rounded-md border border-ink-650 bg-[#171c22] py-1 shadow-panel"
          role="listbox"
          aria-label="Tag suggestions"
        >
          <div className="flex items-center justify-between px-2.5 pb-1 pt-0.5">
            <span className="text-[8px] font-semibold uppercase tracking-[0.15em] text-zinc-600">
              Tag library
            </span>
            <span className="inline-flex items-center gap-1 text-[8px] text-zinc-700">
              <Sparkles className="h-2.5 w-2.5" />
              {suggestions.length} matches
            </span>
          </div>
          {suggestions.map((suggestion, index) => {
            const active = index === highlight
            const queryIndex = suggestion.toLocaleLowerCase().indexOf(value.toLocaleLowerCase())
            return (
              <button
                key={suggestion}
                type="button"
                role="option"
                aria-selected={active}
                onMouseDown={(event) => {
                  event.preventDefault()
                  accept(suggestion)
                }}
                onMouseEnter={() => setHighlight(index)}
                className={cn(
                  'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11.5px] transition-colors',
                  active ? 'bg-accent/10 text-accent-bright' : 'text-zinc-300 hover:bg-white/[0.035]',
                )}
              >
                <Hash className="h-3 w-3 shrink-0 opacity-50" />
                <span className="min-w-0 flex-1 truncate">
                  {queryIndex >= 0 ? (
                    <>
                      {suggestion.slice(0, queryIndex)}
                      <span className="font-semibold text-zinc-100">
                        {suggestion.slice(queryIndex, queryIndex + value.length)}
                      </span>
                      {suggestion.slice(queryIndex + value.length)}
                    </>
                  ) : (
                    suggestion
                  )}
                </span>
                {active && <CornerDownLeft className="h-2.5 w-2.5 opacity-50" />}
              </button>
            )
          })}
          <div className="mt-1 flex items-center gap-2 border-t border-ink-700/70 px-2.5 pb-0.5 pt-1.5 text-[8px] text-zinc-700">
            <span className="kbd">↑</span>
            <span className="kbd">↓</span>
            navigate
            <span className="ml-auto flex gap-1">
              <span className="kbd">Tab</span>
              <span className="kbd">↵</span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
