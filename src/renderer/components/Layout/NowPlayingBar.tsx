import { useState } from 'react'
import { usePlayerStore } from '../../stores/player'
import { useDownloadStore } from '../../stores/download'
import { useLibraryStore } from '../../stores/library'
import { useToastStore } from '../../stores/toast'
import { jellyfin } from '../../services/jellyfin'
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Shuffle, Repeat, Repeat1, ListMusic, ChevronUp,
  Download, Check, ListPlus
} from 'lucide-react'
import { PlaylistPicker, InputModal } from '../UI/Modal'

function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function NowPlayingBar() {
  const {
    currentTrack, isPlaying, currentTime, duration, volume, shuffle, repeat,
    showQueue, togglePlay, next, previous, seek, setVolume, toggleShuffle,
    toggleRepeat, setShowFullScreen, setShowQueue
  } = usePlayerStore()
  const { isDownloaded, startDownload } = useDownloadStore()
  const { playlists, fetchPlaylists } = useLibraryStore()

  const [showPicker, setShowPicker] = useState(false)
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false)
  const toast = useToastStore(s => s.show)

  if (!currentTrack) {
    return (
      <div className="h-14 bg-bg-secondary/90 backdrop-blur-xl border-b border-border-subtle flex items-center justify-center shrink-0 relative">
        <div className="absolute inset-0 drag-region z-0" style={{ right: '140px' }} />
        <p className="text-text-tertiary text-sm relative z-10">No song playing</p>
      </div>
    )
  }

  const item = currentTrack.item
  const imageUrl = item.AlbumId
    ? jellyfin.getImageUrl(item.AlbumId, item.ImageTags?.Primary)
    : item.ImageTags?.Primary
      ? jellyfin.getImageUrl(item.Id, item.ImageTags.Primary)
      : null

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const downloaded = isDownloaded(item.Id)

  return (
    <div className="h-14 bg-bg-secondary/90 backdrop-blur-xl border-b border-border-subtle flex flex-col relative shrink-0">
      {/* Drag region that avoids window controls area - behind content */}
      <div className="absolute inset-0 drag-region z-0" style={{ right: '140px' }} />
      {/* Progress bar - thin line at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/10 cursor-pointer group z-10 no-drag"
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

      <div className="flex-1 flex items-center px-4 gap-4 no-drag relative z-10">
        {/* Track info */}
        <div
          className="flex items-center gap-3 w-64 min-w-0 cursor-pointer"
          onClick={() => setShowFullScreen(true)}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              className="w-9 h-9 rounded-md object-cover shadow-lg"
              alt=""
            />
          ) : (
            <div className="w-9 h-9 rounded-md bg-bg-elevated flex items-center justify-center">
              <ListMusic size={16} className="text-text-tertiary" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[13px] font-medium truncate">{item.Name}</p>
            <p className="text-[11px] text-text-secondary truncate">
              {item.Artists?.join(', ') || item.AlbumArtist || 'Unknown Artist'}
            </p>
          </div>
          <ChevronUp size={14} className="text-text-tertiary shrink-0 ml-1" />
        </div>

        {/* Playback controls */}
        <div className="flex-1 flex items-center justify-center gap-5">
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
            className="w-9 h-9 bg-white rounded-full flex items-center justify-center hover:scale-105 transition-transform"
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
        <div className="w-64 flex items-center justify-end gap-3">
          <span className="text-[11px] text-text-tertiary tabular-nums whitespace-nowrap shrink-0">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <button
            onClick={() => { fetchPlaylists(); setShowPicker(true) }}
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

      <PlaylistPicker
        open={showPicker}
        playlists={playlists}
        onClose={() => setShowPicker(false)}
        onSelect={async (playlistId) => {
          try {
            await jellyfin.addToPlaylist(playlistId, [item.Id])
            toast('Added to playlist', 'success')
          } catch (err) {
            console.error('Failed to add to playlist:', err)
            toast('Could not add to playlist', 'error')
          }
        }}
        onCreate={() => {
          setShowPicker(false)
          setShowCreatePlaylist(true)
        }}
      />

      <InputModal
        open={showCreatePlaylist}
        title="New Playlist"
        placeholder="Playlist name"
        confirmLabel="Create"
        onClose={() => setShowCreatePlaylist(false)}
        onConfirm={async (name) => {
          try {
            await jellyfin.createPlaylist(name, [item.Id])
            fetchPlaylists()
            toast('Playlist created', 'success')
          } catch (err) {
            console.error('Failed to create playlist:', err)
            toast('Error creating playlist', 'error')
          }
        }}
      />
    </div>
  )
}
