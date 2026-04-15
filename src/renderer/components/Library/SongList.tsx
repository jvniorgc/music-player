import { useEffect, useCallback, useRef } from 'react'
import { useLibraryStore } from '../../stores/library'
import { usePlayerStore } from '../../stores/player'
import { useDownloadStore } from '../../stores/download'
import { jellyfin, JellyfinItem } from '../../services/jellyfin'
import { Play, Loader2, Download, Check, Music } from 'lucide-react'

function formatDuration(ticks?: number): string {
  if (!ticks) return ''
  const seconds = Math.floor(ticks / 10_000_000)
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function SongList() {
  const { songs, totalSongs, isLoading, fetchSongs, loadMoreSongs } = useLibraryStore()
  const { playItems, currentTrack, isPlaying } = usePlayerStore()
  const { isDownloaded, startDownload } = useDownloadStore()
  const loaderRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (songs.length === 0) fetchSongs()
  }, [])

  const observerCallback = useCallback((entries: IntersectionObserverEntry[]) => {
    if (entries[0].isIntersecting && !isLoading && songs.length < totalSongs) {
      loadMoreSongs()
    }
  }, [isLoading, songs.length, totalSongs])

  useEffect(() => {
    const observer = new IntersectionObserver(observerCallback, { threshold: 0.1 })
    if (loaderRef.current) observer.observe(loaderRef.current)
    return () => observer.disconnect()
  }, [observerCallback])

  return (
    <div className="fade-in">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Músicas</h1>
        {totalSongs > 0 && (
          <p className="text-sm text-text-secondary mt-1">{totalSongs} músicas</p>
        )}
      </div>

      {/* Header row */}
      <div className="flex items-center gap-4 px-5 py-2 text-xs text-text-tertiary uppercase tracking-wider border-b border-border-subtle mb-1">
        <span className="w-8 text-right">#</span>
        <span className="w-10" />
        <span className="flex-1">Título</span>
        <span className="w-40 hidden md:block">Álbum</span>
        <span className="w-12 text-right">⏱</span>
        <span className="w-8" />
      </div>

      <div className="bg-bg-secondary/30 rounded-xl overflow-hidden">
        {songs.map((song, i) => {
          const isCurrent = currentTrack?.id === song.Id
          const downloaded = isDownloaded(song.Id)
          const imageUrl = song.AlbumId ? jellyfin.getImageUrl(song.AlbumId, undefined, 80) : null

          return (
            <div
              key={`${song.Id}-${i}`}
              className={`flex items-center gap-4 px-5 py-2.5 hover:bg-white/5 transition-colors cursor-pointer group ${
                isCurrent ? 'bg-white/5' : ''
              }`}
              onClick={() => playItems(songs, i)}
            >
              <div className="w-8 text-right">
                {isCurrent && isPlaying ? (
                  <div className="flex items-center justify-end gap-[2px]">
                    <div className="w-[3px] h-3 bg-accent rounded-full animate-pulse" />
                    <div className="w-[3px] h-4 bg-accent rounded-full animate-pulse" style={{ animationDelay: '0.15s' }} />
                    <div className="w-[3px] h-2 bg-accent rounded-full animate-pulse" style={{ animationDelay: '0.3s' }} />
                  </div>
                ) : (
                  <>
                    <span className={`text-sm tabular-nums group-hover:hidden ${isCurrent ? 'text-accent' : 'text-text-tertiary'}`}>
                      {i + 1}
                    </span>
                    <Play size={14} className="text-white hidden group-hover:block ml-auto" fill="white" />
                  </>
                )}
              </div>

              <div className="w-10 h-10 rounded overflow-hidden bg-bg-elevated shrink-0">
                {imageUrl ? (
                  <img src={imageUrl} className="w-full h-full object-cover" alt="" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Music size={16} className="text-text-tertiary" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium truncate ${isCurrent ? 'text-accent' : ''}`}>
                  {song.Name}
                </p>
                <p className="text-xs text-text-secondary truncate">
                  {song.Artists?.join(', ') || song.AlbumArtist || 'Desconhecido'}
                </p>
              </div>

              <span className="w-40 text-sm text-text-secondary truncate hidden md:block">
                {song.Album || ''}
              </span>

              <span className="w-12 text-xs text-text-tertiary tabular-nums text-right shrink-0">
                {formatDuration(song.RunTimeTicks)}
              </span>

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (!downloaded) startDownload(song)
                }}
                className={`w-8 flex justify-center ${
                  downloaded ? 'text-accent' : 'text-text-tertiary opacity-0 group-hover:opacity-100'
                } transition-all`}
              >
                {downloaded ? <Check size={14} /> : <Download size={14} />}
              </button>
            </div>
          )
        })}
      </div>

      <div ref={loaderRef} className="py-8 flex justify-center">
        {isLoading && <Loader2 size={24} className="animate-spin text-text-tertiary" />}
      </div>
    </div>
  )
}
