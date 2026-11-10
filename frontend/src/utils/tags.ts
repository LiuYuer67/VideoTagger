export function normalizeTag(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 100).trim()
}

export function splitTagInput(value: string): { complete: string[]; partial: string } {
  const pieces = value.split(',')
  const partial = pieces.pop() ?? ''
  return {
    complete: pieces.map(normalizeTag).filter(Boolean),
    partial,
  }
}

export function mergeUniqueTags(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing.map((tag) => tag.toLocaleLowerCase()))
  const result = [...existing]
  for (const raw of incoming) {
    const tag = normalizeTag(raw)
    if (!tag) continue
    const key = tag.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(tag)
  }
  return result
}

export function suggestionScore(tag: string, query: string): number {
  const normalized = tag.toLocaleLowerCase()
  const q = query.toLocaleLowerCase()
  if (normalized === q) return 0
  if (normalized.startsWith(q)) return 1
  if (normalized.split(/\s+/).some((word) => word.startsWith(q))) return 2
  return 3
}

export function filterSuggestions(
  tags: string[],
  query: string,
  excluded: string[],
  limit = 8,
): string[] {
  const q = normalizeTag(query)
  if (!q) return []
  const excludedKeys = new Set(excluded.map((tag) => tag.toLocaleLowerCase()))
  return tags
    .filter((tag) => !excludedKeys.has(tag.toLocaleLowerCase()))
    .filter((tag) => tag.toLocaleLowerCase().includes(q.toLocaleLowerCase()))
    .sort((a, b) => {
      const score = suggestionScore(a, q) - suggestionScore(b, q)
      if (score !== 0) return score
      return a.localeCompare(b)
    })
    .slice(0, limit)
}
