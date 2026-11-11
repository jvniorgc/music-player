import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { jellyfin, JellyfinItem } from '../../services/jellyfin'
import { isAbortError } from '../../services/http'
import { usePlayerStore } from '../../stores/player'
import { useLibraryStore } from '../../stores/library'
import { Search, X, Disc3, Users, Music, Loader2 } from 'lucide-react'
import TrackMenu from '../UI/TrackMenu'
import AddToPlaylist from '../UI/AddToPlaylist'
import { TrackSubtitle } from '../UI/Links'
import { FOCUS_SEARCH_EVENT } from '../../lib/shortcuts'
import TrackRow, { TrackDuration, CoverPlayOverlay } from '../UI/TrackRow'
import CoverArt from '../UI/CoverArt'
import { AlbumCard, ArtistCard } from '../UI/MediaCard'
import { useShallow } from 'zustand/react/shallow'

export default function SearchView() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ albums: JellyfinItem[]; artists: JellyfinItem[]; songs: JellyfinItem[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const playItems = usePlayerStore(s => s.playItems)
  const { playlists, fetchPlaylists } = useLibraryStore(useShallow(s => ({ playlists: s.playlists, fetchPlaylists: s.fetchPlaylists })))
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const [pickerSong, setPickerSong] = useState<JellyfinItem | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    if (playlists.length === 0) fetchPlaylists()
    const focus = () => { inputRef.current?.focus(); inputRef.current?.select() }
    window.addEventListener(FOCUS_SEARCH_EVENT, focus)
    return () => window.removeEventListener(FOCUS_SEARCH_EVENT, focus)
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!query.trim()) {
      setResults(null)
      setLoading(false)
      return
    }

    // Each query gets its own controller: a newer keystroke aborts the
    // in-flight request and stale responses are ignored.
    const controller = new AbortController()
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await jellyfin.search(query.trim(), undefined, controller.signal)
        if (!controller.signal.aborted) setResults(res)
      } catch (err) {
        if (!controller.signal.aborted && !isAbortError(err)) console.error('Search error:', err)
      }
      if (!controller.signal.aborted) setLoading(false)
    }, 300)

    return () => {
      controller.abort()
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

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
          placeholder="Search songs, albums, artists..."
          className="w-full bg-surface-2 border border-border rounded-sm pl-11 pr-10 h-10 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); inputRef.current?.focus() }}
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

      {results && !loading && (
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
                    onClick={() => playItems(results.songs, i)}
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
                    <TrackMenu track={song} onPlaylistAdd={(s) => setPickerSong(s)} />
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
                    onClick={() => navigate(`/album/${album.Id}`)}
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
                    onClick={() => navigate(`/artist/${artist.Id}`)}
                  />
                ))}
              </div>
            </section>
          )}

          {results.songs.length === 0 && results.albums.length === 0 && results.artists.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-text-tertiary">
              <Search size={40} className="mb-4 opacity-50" />
              <h3 className="text-lg font-medium text-text-secondary">No results</h3>
              <p className="text-sm mt-1">Try searching for another term</p>
            </div>
          )}
        </div>
      )}

      {!results && !loading && (
        <div className="flex flex-col items-center justify-center py-24 text-text-tertiary">
          <Search size={48} className="mb-4 opacity-30" />
          <p className="text-sm">Type to search your library</p>
        </div>
      )}

      <AddToPlaylist song={pickerSong} onClose={() => setPickerSong(null)} />
    </div>
  )
}
