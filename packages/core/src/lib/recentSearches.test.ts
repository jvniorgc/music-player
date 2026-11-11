import { describe, it, expect, beforeEach } from 'vitest'
import { addRecentSearch, loadRecentSearches, removeRecentSearch, clearRecentSearches, MAX_RECENT_SEARCHES } from './recentSearches'

describe('recent searches', () => {
  beforeEach(() => localStorage.clear())

  it('adds to the front, dedupes case-insensitively and caps the list', () => {
    addRecentSearch('a'); addRecentSearch('b'); addRecentSearch(' A ')
    expect(loadRecentSearches()).toEqual(['A', 'b'])
    for (let i = 0; i < 15; i++) addRecentSearch(`q${i}`)
    expect(loadRecentSearches()).toHaveLength(MAX_RECENT_SEARCHES)
    expect(loadRecentSearches()[0]).toBe('q14')
    expect(addRecentSearch('   ')).toHaveLength(MAX_RECENT_SEARCHES)
  })

  it('removes, clears and tolerates invalid data', () => {
    addRecentSearch('x'); addRecentSearch('y')
    expect(removeRecentSearch('x')).toEqual(['y'])
    expect(clearRecentSearches()).toEqual([])
    localStorage.setItem('recent_searches', '{"no":1}')
    expect(loadRecentSearches()).toEqual([])
    localStorage.setItem('recent_searches', 'nope')
    expect(loadRecentSearches()).toEqual([])
    localStorage.setItem('recent_searches', '["ok", 3, ""]')
    expect(loadRecentSearches()).toEqual(['ok'])
  })
})
