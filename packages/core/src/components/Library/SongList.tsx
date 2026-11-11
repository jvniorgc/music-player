import { useEffect, useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { getScrollParent } from '../../lib/scroll'
import { useLibraryStore } from '../../stores/library'
import { usePlayerStore } from '../../stores/player'
import { useDownloadStore } from '../../stores/download'
import { jellyfin, JellyfinItem } from '../../services/jellyfin'
import { Loader2, Download, Check } from 'lucide-react'
import TrackMenu from '../UI/TrackMenu'
import AddToPlaylist from '../UI/AddToPlaylist'
import { artistNames } from '../../lib/format'
import TrackRow, { TrackIndex, TrackDuration } from '../UI/TrackRow'
import CoverArt from '../UI/CoverArt'
import { useShallow } from 'zustand/react/shallow'

export default function SongList() {
  const { songs, totalSongs, playlists, isLoading, fetchSongs, loadMoreSongs, fetchPlaylists } = useLibraryStore(useShallow(s => ({
    songs: s.songs,
    totalSongs: s.totalSongs,
    playlists: s.playlists,
    isLoading: s.isLoading,
    fetchSongs: s.fetchSongs,
    loadMoreSongs: s.loadMoreSongs,
    fetchPlaylists: s.fetchPlaylists,
  })))
  const { playItems, currentTrack, isPlaying } = usePlayerStore(useShallow(s => ({ playItems: s.playItems, currentTrack: s.currentTrack, isPlaying: s.isPlaying })))
  const { isDownloaded, startDownload } = useDownloadStore(useShallow(s => ({ isDownloaded: s.isDownloaded, startDownload: s.startDownload, downloads: s.downloads })))
  const loaderRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null)
  const [scrollMargin, setScrollMargin] = useState(0)

  // The library can hold thousands of songs, so only rows near the viewport are mounted.
  const virtualizer = useVirtualizer({
    count: songs.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => 60,
    overscan: 10,
    scrollMargin,
  })

  useLayoutEffect(() => {
    const list = listRef.current
    const parent = getScrollParent(list)
    setScrollEl(parent)
    if (!list || !parent) return
    const update = () => {
      setScrollMargin(list.getBoundingClientRect().top - parent.getBoundingClientRect().top + parent.scrollTop)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(parent)
    return () => ro.disconnect()
  }, [])

  const [pickerSong, setPickerSong] = useState<JellyfinItem | null>(null)

  useEffect(() => {
    if (songs.length === 0) fetchSongs()
    if (playlists.length === 0) fetchPlaylists()
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
        <h1 className="text-title font-semibold">Songs</h1>
        {totalSongs > 0 && (
          <p className="text-sm text-text-secondary mt-1">{totalSongs} songs</p>
        )}
      </div>

      {/* Header row */}
      <div className="flex items-center gap-4 px-5 py-2 text-xs text-text-tertiary border-b border-border mb-1">
        <span className="w-8 text-right">#</span>
        <span className="w-10" />
        <span className="flex-1">Title</span>
        <span className="w-40 hidden md:block">Album</span>
        <span className="w-12 text-right">⏱</span>
        <span className="w-20" />
      </div>

      <div
        ref={listRef}
        className="relative"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map(row => {
          const i = row.index
          const song = songs[i]
          const isCurrent = currentTrack?.id === song.Id
          const downloaded = isDownloaded(song.Id)

          return (
            <div
              key={row.key}
              data-index={i}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${row.start - scrollMargin}px)` }}
            >
              <TrackRow
                className="px-5 py-2.5"
                isCurrent={isCurrent}
                onClick={() => playItems(songs, i)}
                leading={
                  <>
                    <TrackIndex number={i + 1} isCurrent={isCurrent} isPlaying={isPlaying} />
                    <CoverArt
                      src={song.AlbumId ? jellyfin.getImageUrl(song.AlbumId, undefined, 80) : null}
                      className="w-10 h-10 rounded overflow-hidden bg-surface-2 shrink-0"
                    />
                  </>
                }
                title={song.Name}
                subtitle={artistNames(song, 'Unknown')}
              >
                <span className="w-40 text-sm text-text-secondary truncate hidden md:block">
                  {song.Album || ''}
                </span>

                <TrackDuration ticks={song.RunTimeTicks} className="w-12 text-right" />

                <div className="w-20 flex justify-end gap-1 items-center">
                  <TrackMenu track={song} onPlaylistAdd={(s) => setPickerSong(s)} />
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!downloaded) startDownload(song)
                    }}
                    className={`p-1 ${
                      downloaded ? 'text-accent' : 'text-text-tertiary opacity-0 group-hover:opacity-100'
                    } transition-all`}
                  >
                    {downloaded ? <Check size={14} /> : <Download size={14} />}
                  </button>
                </div>
              </TrackRow>
            </div>
          )
        })}
      </div>

      <div ref={loaderRef} className="py-8 flex justify-center">
        {isLoading && <Loader2 size={24} className="animate-spin text-text-tertiary" />}
      </div>

      <AddToPlaylist song={pickerSong} onClose={() => setPickerSong(null)} />
    </div>
  )
}
