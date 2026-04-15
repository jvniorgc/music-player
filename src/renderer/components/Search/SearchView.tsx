import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { jellyfin, JellyfinItem } from '../../services/jellyfin'
import { usePlayerStore } from '../../stores/player'
import { Search, X, Play, Disc3, Users, Music, Loader2 } from 'lucide-react'

function formatDuration(ticks?: number): string {
  if (!ticks) return ''
  const seconds = Math.floor(ticks / 10_000_000)
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function SearchView() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ albums: JellyfinItem[]; artists: JellyfinItem[]; songs: JellyfinItem[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { playItems } = usePlayerStore()
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!query.trim()) {
      setResults(null)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await jellyfin.search(query.trim())
        setResults(res)
      } catch (err) {
        console.error('Search error:', err)
      }
      setLoading(false)
    }, 300)

    return () => {
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
          placeholder="Buscar músicas, álbuns, artistas..."
          className="w-full bg-bg-elevated border border-border rounded-xl pl-11 pr-10 py-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition"
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
                <h2 className="text-lg font-bold">Músicas</h2>
              </div>
              <div className="bg-bg-secondary/40 rounded-xl overflow-hidden">
                {results.songs.map((song, i) => {
                  const imageUrl = song.AlbumId ? jellyfin.getImageUrl(song.AlbumId, undefined, 80) : null
                  return (
                    <div
                      key={song.Id}
                      className="flex items-center gap-4 px-5 py-2.5 hover:bg-white/5 transition-colors cursor-pointer group"
                      onClick={() => playItems(results.songs, i)}
                    >
                      <div className="w-10 h-10 rounded overflow-hidden bg-bg-elevated shrink-0 relative">
                        {imageUrl ? (
                          <img src={imageUrl} className="w-full h-full object-cover" alt="" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Music size={16} className="text-text-tertiary" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors">
                          <Play size={14} className="text-white opacity-0 group-hover:opacity-100 ml-0.5" fill="white" />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{song.Name}</p>
                        <p className="text-xs text-text-secondary truncate">
                          {song.Artists?.join(', ') || song.AlbumArtist}
                          {song.Album ? ` — ${song.Album}` : ''}
                        </p>
                      </div>
                      <span className="text-xs text-text-tertiary tabular-nums">
                        {formatDuration(song.RunTimeTicks)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Albums */}
          {results.albums.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Disc3 size={18} className="text-accent" />
                <h2 className="text-lg font-bold">Álbuns</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                {results.albums.map(album => {
                  const imageUrl = jellyfin.getImageUrl(album.Id, album.ImageTags?.Primary)
                  return (
                    <div
                      key={album.Id}
                      className="group cursor-pointer"
                      onClick={() => navigate(`/album/${album.Id}`)}
                    >
                      <div className="relative aspect-square rounded-xl overflow-hidden bg-bg-elevated mb-3 shadow-lg shadow-black/20">
                        {album.ImageTags?.Primary ? (
                          <img src={imageUrl} className="w-full h-full object-cover" alt="" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-bg-elevated to-bg-tertiary">
                            <span className="text-3xl">💿</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                        <button
                          onClick={async (e) => {
                            e.stopPropagation()
                            try {
                              const res = await jellyfin.getAlbumItems(album.Id)
                              if (res.Items.length > 0) playItems(res.Items)
                            } catch (err) {
                              console.error('Failed to play album:', err)
                            }
                          }}
                          className="absolute bottom-3 right-3 w-10 h-10 bg-accent rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 transform translate-y-1 group-hover:translate-y-0 shadow-lg shadow-black/30"
                        >
                          <Play size={18} className="text-white ml-0.5" fill="white" />
                        </button>
                      </div>
                      <p className="text-sm font-medium truncate">{album.Name}</p>
                      <p className="text-xs text-text-secondary truncate">
                        {album.AlbumArtist}{album.ProductionYear ? ` · ${album.ProductionYear}` : ''}
                      </p>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Artists */}
          {results.artists.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Users size={18} className="text-accent" />
                <h2 className="text-lg font-bold">Artistas</h2>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-5">
                {results.artists.map(artist => {
                  const imageUrl = artist.ImageTags?.Primary
                    ? jellyfin.getImageUrl(artist.Id, artist.ImageTags.Primary)
                    : null
                  return (
                    <div
                      key={artist.Id}
                      className="group cursor-pointer text-center"
                      onClick={() => navigate(`/artist/${artist.Id}`)}
                    >
                      <div className="aspect-square rounded-full overflow-hidden bg-bg-elevated mb-3 mx-auto shadow-lg">
                        {imageUrl ? (
                          <img src={imageUrl} className="w-full h-full object-cover" alt="" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-bg-elevated to-bg-tertiary">
                            <span className="text-3xl">🎤</span>
                          </div>
                        )}
                      </div>
                      <p className="text-sm font-medium truncate">{artist.Name}</p>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {results.songs.length === 0 && results.albums.length === 0 && results.artists.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-text-tertiary">
              <Search size={40} className="mb-4 opacity-50" />
              <h3 className="text-lg font-medium text-text-secondary">Nenhum resultado</h3>
              <p className="text-sm mt-1">Tente buscar por outro termo</p>
            </div>
          )}
        </div>
      )}

      {!results && !loading && (
        <div className="flex flex-col items-center justify-center py-24 text-text-tertiary">
          <Search size={48} className="mb-4 opacity-30" />
          <p className="text-sm">Digite para buscar na sua biblioteca</p>
        </div>
      )}
    </div>
  )
}
