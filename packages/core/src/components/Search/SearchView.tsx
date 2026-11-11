import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { jellyfin, JellyfinItem } from '../../services/jellyfin'
import { isAbortError } from '../../services/http'
import { usePlayerStore } from '../../stores/player'
import { useLibraryStore } from '../../stores/library'
import { Search, X, Disc3, Users, Music, Loader2, AlertCircle, RefreshCw, History } from 'lucide-react'
import { buttonClass } from '../UI/Button'
import { loadRecentSearches, addRecentSearch, removeRecentSearch, clearRecentSearches } from '../../lib/recentSearches'
import TrackMenu from '../UI/TrackMenu'
import { TrackSubtitle } from '../UI/Links'
import { FOCUS_SEARCH_EVENT } from '../../lib/shortcuts'
import TrackRow, { TrackDuration, CoverPlayOverlay } from '../UI/TrackRow'
import CoverArt from '../UI/CoverArt'
import { AlbumCard, ArtistCard } from '../UI/MediaCard'
import { useShallow } from 'zustand/react/shallow'

/** Page strings, kept together for later extraction (i18n). */
const TEXT = {
  placeholder: 'Search songs, albums, artists...',
  clear: 'Clear search',
  recent: 'Recent searches',
  clearRecent: 'Clear',
  removeRecent: 'Remove from recent searches',
  idle: 'Type to search your library',
  error: 'Search failed. Check your connection.',
  retry: 'Try again',
  noResults: (q: string) => `No results for "${q}"`,
  noResultsHint: 'Check the spelling or try another term',
  context: (q: string) => `Search "${q}"`,
}

type Results = { albums: JellyfinItem[]; artists: JellyfinItem[]; songs: JellyfinItem[] }

export default function SearchView() {
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(() => params.get('q') ?? '')
  const [results, setResults] = useState<Results | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [recent, setRecent] = useState(loadRecentSearches)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const playItems = usePlayerStore(s => s.playItems)
  const { playlists, fetchPlaylists } = useLibraryStore(useShallow(s => ({ playlists: s.playlists, fetchPlaylists: s.fetchPlaylists })))
  const trimmed = query.trim()

  useEffect(() => {
    inputRef.current?.focus()
    if (playlists.length === 0) fetchPlaylists()
    const focus = () => { inputRef.current?.focus(); inputRef.current?.select() }
    window.addEventListener(FOCUS_SEARCH_EVENT, focus)
    return () => window.removeEventListener(FOCUS_SEARCH_EVENT, focus)
  }, [])

  useEffect(() => {
    setError(false)
    if (!trimmed) {
      setResults(null)
      setLoading(false)
      if (params.has('q')) setParams({}, { replace: true })
      return
    }

    // Each query gets its own controller: a newer keystroke aborts the
    // in-flight request and stale responses are ignored.
    const controller = new AbortController()
    setLoading(true)
    const timer = setTimeout(async () => {
      if (params.get('q') !== trimmed) setParams({ q: trimmed }, { replace: true })
      try {
        const res = await jellyfin.search(trimmed, undefined, controller.signal)
        if (!controller.signal.aborted) setResults(res)
      } catch (err) {
        if (controller.signal.aborted || isAbortError(err)) return
        console.error('Search error:', err)
        setError(true)
        setResults(null)
      }
      if (!controller.signal.aborted) setLoading(false)
    }, 300)

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [trimmed, attempt])

  const remember = () => setRecent(addRecentSearch(trimmed))
  const clear = () => { setQuery(''); inputRef.current?.focus() }

  return (
    <div className="fade-in">
      {/* Search input */}
      <div className="relative max-w-xl mb-8">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape' && query) { e.preventDefault(); e.stopPropagation(); clear() }
            if (e.key === 'Enter' && trimmed) remember()
          }}
          placeholder={TEXT.placeholder}
          aria-label={TEXT.placeholder}
          className="w-full bg-surface-2 border border-border rounded-sm pl-11 pr-10 h-10 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition"
        />
        {query && (
          <button
            onClick={clear}
            title={TEXT.clear}
            aria-label={TEXT.clear}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-white/10 text-text-tertiary"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-text-tertiary" />
        </div>
      )}

      {error && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-text-tertiary">
          <AlertCircle size={40} className="mb-4 opacity-50" />
          <p className="text-sm text-text-secondary">{TEXT.error}</p>
          <button onClick={() => setAttempt(a => a + 1)} className={`${buttonClass('secondary')} mt-4`}>
            <RefreshCw size={14} /> {TEXT.retry}
          </button>
        </div>
      )}

      {results && !loading && !error && (
        <div className="space-y-10">
          {/* Songs */}
          {results.songs.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Music size={18} className="text-accent" />
                <h2 className="text-heading font-semibold">Songs</h2>
              </div>
              <div>
                {results.songs.map((song, i) => (
                  <TrackRow
                    key={song.Id}
                    className="px-5 py-2.5"
                    onClick={() => { remember(); playItems(results.songs, i, { type: 'search', id: trimmed, name: TEXT.context(trimmed) }) }}
                    leading={
                      <CoverArt
                        src={song.AlbumId ? jellyfin.getImageUrl(song.AlbumId, undefined, 80) : null}
                        className="w-10 h-10 rounded overflow-hidden bg-surface-2 shrink-0 relative"
                      >
                        <CoverPlayOverlay />
                      </CoverArt>
                    }
                    title={song.Name}
                    subtitle={<TrackSubtitle item={song} />}
                  >
                    <TrackDuration ticks={song.RunTimeTicks} />
                    <TrackMenu track={song} />
                  </TrackRow>
                ))}
              </div>
            </section>
          )}

          {/* Albums */}
          {results.albums.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Disc3 size={18} className="text-accent" />
                <h2 className="text-heading font-semibold">Albums</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                {results.albums.map(album => (
                  <AlbumCard
                    key={album.Id}
                    item={album}
                    onClick={() => { remember(); navigate(`/album/${album.Id}`) }}
                                      />
                ))}
              </div>
            </section>
          )}

          {/* Artists */}
          {results.artists.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Users size={18} className="text-accent" />
                <h2 className="text-heading font-semibold">Artists</h2>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-5">
                {results.artists.map(artist => (
                  <ArtistCard
                    key={artist.Id}
                    item={artist}
                    onClick={() => { remember(); navigate(`/artist/${artist.Id}`) }}
                  />
                ))}
              </div>
            </section>
          )}

          {results.songs.length === 0 && results.albums.length === 0 && results.artists.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-text-tertiary">
              <Search size={40} className="mb-4 opacity-50" />
              <h3 className="text-lg font-medium text-text-secondary">{TEXT.noResults(trimmed)}</h3>
              <p className="text-sm mt-1">{TEXT.noResultsHint}</p>
            </div>
          )}
        </div>
      )}

      {!trimmed && recent.length > 0 && (
        <section className="max-w-xl">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-heading font-semibold">{TEXT.recent}</h2>
            <button onClick={() => setRecent(clearRecentSearches())} className="text-sm text-text-secondary hover:text-text-primary">
              {TEXT.clearRecent}
            </button>
          </div>
          <ul>
            {recent.map(q => (
              <li key={q} className="group flex items-center gap-3 rounded-sm hover:bg-white/5">
                <button onClick={() => setQuery(q)} className="flex-1 flex items-center gap-3 px-3 py-2 text-sm text-left min-w-0">
                  <History size={16} className="text-text-tertiary shrink-0" />
                  <span className="truncate">{q}</span>
                </button>
                <button
                  onClick={() => setRecent(removeRecentSearch(q))}
                  className="p-1 mr-2 rounded-full text-text-tertiary hover:text-text-primary hover:bg-white/10 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  title={TEXT.removeRecent}
                  aria-label={TEXT.removeRecent}
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!trimmed && recent.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-text-tertiary">
          <Search size={48} className="mb-4 opacity-30" />
          <p className="text-sm">{TEXT.idle}</p>
        </div>
      )}

    </div>
  )
}
