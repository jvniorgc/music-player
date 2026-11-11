import { useState } from 'react'
import { usePlayerStore } from '../../stores/player'
import { useDownloadStore } from '../../stores/download'
import { useLibraryStore } from '../../stores/library'
import { jellyfin, type JellyfinItem } from '../../services/jellyfin'
import { useShallow } from 'zustand/react/shallow'
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Shuffle, Repeat, Repeat1, ListMusic, ChevronUp,
  Download, Check, ListPlus
} from 'lucide-react'
import AddToPlaylist from '../UI/AddToPlaylist'
import CoverArt from '../UI/CoverArt'
import { formatTime } from '../../lib/format'
import { ArtistLinks, AlbumLink } from '../UI/Links'

export default function NowPlayingBar() {
  const {
    currentTrack, isPlaying, volume, shuffle, repeat,
    showQueue, togglePlay, next, previous, setVolume, toggleShuffle,
    toggleRepeat, setShowFullScreen, setShowQueue
  } = usePlayerStore(useShallow(s => ({
    currentTrack: s.currentTrack, isPlaying: s.isPlaying, volume: s.volume, shuffle: s.shuffle,
    repeat: s.repeat, showQueue: s.showQueue, togglePlay: s.togglePlay, next: s.next,
    previous: s.previous, setVolume: s.setVolume, toggleShuffle: s.toggleShuffle,
    toggleRepeat: s.toggleRepeat, setShowFullScreen: s.setShowFullScreen, setShowQueue: s.setShowQueue,
  })))
  const itemId = currentTrack?.item.Id
  const downloaded = useDownloadStore(s => (itemId ? s.isDownloaded(itemId) : false))
  const startDownload = useDownloadStore(s => s.startDownload)
  const fetchPlaylists = useLibraryStore(s => s.fetchPlaylists)

  const [pickerSong, setPickerSong] = useState<JellyfinItem | null>(null)

  if (!currentTrack) {
    return (
      <div className="h-14 bg-surface-1 border-b border-border flex items-center justify-center shrink-0">
        <p className="text-text-tertiary text-sm">No song playing</p>
      </div>
    )
  }

  const item = currentTrack.item
  const imageUrl = item.AlbumId
    ? jellyfin.getImageUrl(item.AlbumId, item.ImageTags?.Primary)
    : item.ImageTags?.Primary
      ? jellyfin.getImageUrl(item.Id, item.ImageTags.Primary)
      : null

  return (
    <div className="h-14 bg-surface-1 border-b border-border flex flex-col relative shrink-0">
      <ProgressLine />

      <div className="flex-1 flex items-center px-4 gap-4">
        {/* Track info */}
        <div
          className="flex items-center gap-3 flex-1 min-w-0 overflow-hidden cursor-pointer"
          onClick={() => setShowFullScreen(true)}
        >
          <CoverArt
            src={imageUrl}
            className="w-9 h-9 rounded-md overflow-hidden bg-surface-2 shrink-0"
            kind="track"
            loading="eager"
          />
          <div className="min-w-0">
            <p className="text-[13px] font-medium truncate">
              {item.AlbumId ? <AlbumLink item={item}>{item.Name}</AlbumLink> : item.Name}
            </p>
            <p className="text-[11px] text-text-secondary truncate">
              <ArtistLinks item={item} fallback="Unknown artist" />
            </p>
          </div>
          <ChevronUp size={14} className="text-text-tertiary shrink-0 ml-1" />
        </div>

        {/* Playback controls */}
        <div className="flex items-center justify-center gap-5 shrink-0">
          <button
            onClick={toggleShuffle}
            className={`p-1 transition-colors ${shuffle ? 'text-accent' : 'text-text-tertiary hover:text-text-secondary'}`}
          >
            <Shuffle size={16} />
          </button>
          <button
            onClick={previous}
            className="text-text-primary hover:text-white transition-colors p-1"
          >
            <SkipBack size={20} fill="currentColor" />
          </button>
          <button
            onClick={togglePlay}
            className="w-9 h-9 bg-white rounded-full flex items-center justify-center hover:opacity-80 active:opacity-60 transition-opacity"
          >
            {isPlaying ? (
              <Pause size={18} className="text-black" fill="currentColor" />
            ) : (
              <Play size={18} className="text-black ml-0.5" fill="currentColor" />
            )}
          </button>
          <button
            onClick={next}
            className="text-text-primary hover:text-white transition-colors p-1"
          >
            <SkipForward size={20} fill="currentColor" />
          </button>
          <button
            onClick={toggleRepeat}
            className={`p-1 transition-colors ${repeat !== 'none' ? 'text-accent' : 'text-text-tertiary hover:text-text-secondary'}`}
          >
            {repeat === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
          </button>
        </div>

        {/* Right side: time, volume, queue, download */}
        <div className="flex-1 flex items-center justify-end gap-3 min-w-0 overflow-hidden">
          <TimeDisplay />

          <button
            onClick={() => { fetchPlaylists(); setPickerSong(item) }}
            className="p-1.5 transition-colors text-text-tertiary hover:text-text-secondary"
            title="Add to playlist"
          >
            <ListPlus size={15} />
          </button>

          <button
            onClick={() => !downloaded && startDownload(item)}
            className={`p-1.5 transition-colors ${downloaded ? 'text-accent' : 'text-text-tertiary hover:text-text-secondary'}`}
            title={downloaded ? 'Downloaded' : 'Download'}
          >
            {downloaded ? <Check size={15} /> : <Download size={15} />}
          </button>

          <div className="flex items-center gap-1.5 group/vol">
            <button
              onClick={() => setVolume(volume > 0 ? 0 : 1)}
              className="text-text-tertiary hover:text-text-secondary transition-colors p-0.5"
            >
              {volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={e => setVolume(parseFloat(e.target.value))}
              className="w-20 accent-white"
              style={{
                background: `linear-gradient(to right, rgba(255,255,255,0.8) ${volume * 100}%, rgba(255,255,255,0.2) ${volume * 100}%)`
              }}
            />
          </div>

          <button
            onClick={() => setShowQueue(!showQueue)}
            className={`p-1.5 transition-colors ${showQueue ? 'text-accent' : 'text-text-tertiary hover:text-text-secondary'}`}
          >
            <ListMusic size={16} />
          </button>
        </div>
      </div>

      <AddToPlaylist song={pickerSong} onClose={() => setPickerSong(null)} />
    </div>
  )
}

/** Thin seekable progress line; isolated so playback ticks only re-render this. */
function ProgressLine() {
  const currentTime = usePlayerStore(s => s.currentTime)
  const duration = usePlayerStore(s => s.duration)
  const seek = usePlayerStore(s => s.seek)
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/10 cursor-pointer group"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const pct = (e.clientX - rect.left) / rect.width
        seek(pct * duration)
      }}
    >
      <div
        className="h-full bg-accent transition-[width] duration-100"
        style={{ width: `${progress}%` }}
      />
      <div
        className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ left: `${progress}%`, transform: `translate(-50%, -50%)` }}
      />
    </div>
  )
}

function TimeDisplay() {
  const currentTime = usePlayerStore(s => Math.floor(s.currentTime))
  const duration = usePlayerStore(s => s.duration)
  return (
    <span className="text-[11px] text-text-tertiary tabular-nums whitespace-nowrap shrink-0">
      {formatTime(currentTime)} / {formatTime(duration)}
    </span>
  )
}
