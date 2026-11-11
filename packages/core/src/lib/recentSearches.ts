const KEY = 'recent_searches'
export const MAX_RECENT_SEARCHES = 10

export function loadRecentSearches(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.trim() !== '').slice(0, MAX_RECENT_SEARCHES) : []
  } catch {
    return []
  }
}

function save(list: string[]): string[] {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* ignore */ }
  return list
}

/** Moves `query` to the front (case-insensitive dedupe), capped at MAX_RECENT_SEARCHES. */
export function addRecentSearch(query: string): string[] {
  const q = query.trim()
  if (!q) return loadRecentSearches()
  const rest = loadRecentSearches().filter(s => s.toLowerCase() !== q.toLowerCase())
  return save([q, ...rest].slice(0, MAX_RECENT_SEARCHES))
}

export function removeRecentSearch(query: string): string[] {
  return save(loadRecentSearches().filter(s => s !== query))
}

export function clearRecentSearches(): string[] {
  return save([])
}
