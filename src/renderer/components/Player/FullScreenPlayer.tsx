import { useEffect } from 'react'
import { usePlayerStore } from '../../stores/player'
import { jellyfin } from '../../services/jellyfin'
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1,
  ChevronDown, Volume2, VolumeX, Heart, ListMusic
} from 'lucide-react'

function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function FullScreenPlayer() {
  const {
    currentTrack, isPlaying, currentTime, duration, volume, shuffle, repeat,
    togglePlay, next, previous, seek, setVolume, toggleShuffle, toggleRepeat,
    setShowFullScreen
  } = usePlayerStore()

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowFullScreen(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [setShowFullScreen])

  if (!currentTrack) return null
  const item = currentTrack.item

  const imageUrl = item.AlbumId
    ? jellyfin.getImageUrl(item.AlbumId, item.ImageTags?.Primary, 600)
    : item.ImageTags?.Primary
      ? jellyfin.getImageUrl(item.Id, item.ImageTags.Primary, 600)
      : null

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-3xl flex flex-col items-center justify-center fade-in">
      {/* Background blur image */}
      {imageUrl && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <img src={imageUrl} className="w-full h-full object-cover blur-[80px] opacity-30 scale-110" alt="" />
        </div>
      )}

      {/* Close button */}
      <button
        onClick={() => setShowFullScreen(false)}
        className="absolute top-6 left-1/2 -translate-x-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-10 no-drag"
      >
        <ChevronDown size={20} />
      </button>

      <div className="relative z-10 flex flex-col items-center max-w-lg w-full px-8">
        {/* Album Art */}
        <div className="w-80 h-80 rounded-2xl overflow-hidden shadow-2xl shadow-black/50 mb-10">
          {imageUrl ? (
            <img src={imageUrl} className="w-full h-full object-cover" alt="" />
          ) : (
            <div className="w-full h-full bg-bg-elevated flex items-center justify-center">
              <ListMusic size={80} className="text-text-tertiary" />
            </div>
          )}
        </div>

        {/* Track info */}
        <div className="text-center mb-8 w-full">
          <h2 className="text-2xl font-bold truncate">{item.Name}</h2>
          <p className="text-lg text-accent mt-1 truncate">
            {item.Artists?.join(', ') || item.AlbumArtist || 'Artista Desconhecido'}
          </p>
          {item.Album && (
            <p className="text-sm text-text-secondary mt-1 truncate">{item.Album}</p>
          )}
        </div>

        {/* Progress */}
        <div className="w-full mb-6">
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onChange={e => seek(parseFloat(e.target.value))}
            className="w-full h-1 accent-white cursor-pointer"
            style={{
              background: `linear-gradient(to right, rgba(255,255,255,0.9) ${progress}%, rgba(255,255,255,0.2) ${progress}%)`
            }}
          />
          <div className="flex justify-between mt-2">
            <span className="text-xs text-text-secondary tabular-nums">{formatTime(currentTime)}</span>
            <span className="text-xs text-text-secondary tabular-nums">-{formatTime(duration - currentTime)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-8 mb-8">
          <button
            onClick={toggleShuffle}
            className={`p-2 transition-colors ${shuffle ? 'text-accent' : 'text-text-tertiary hover:text-text-secondary'}`}
          >
            <Shuffle size={20} />
          </button>
          <button onClick={previous} className="text-white hover:scale-105 transition-transform p-2">
            <SkipBack size={28} fill="currentColor" />
          </button>
          <button
            onClick={togglePlay}
            className="w-16 h-16 bg-white rounded-full flex items-center justify-center hover:scale-105 transition-transform"
          >
            {isPlaying ? (
              <Pause size={30} className="text-black" fill="currentColor" />
            ) : (
              <Play size={30} className="text-black ml-1" fill="currentColor" />
            )}
          </button>
          <button onClick={next} className="text-white hover:scale-105 transition-transform p-2">
            <SkipForward size={28} fill="currentColor" />
          </button>
          <button
            onClick={toggleRepeat}
            className={`p-2 transition-colors ${repeat !== 'none' ? 'text-accent' : 'text-text-tertiary hover:text-text-secondary'}`}
          >
            {repeat === 'one' ? <Repeat1 size={20} /> : <Repeat size={20} />}
          </button>
        </div>

        {/* Volume */}
        <div className="flex items-center gap-3 w-64">
          <button
            onClick={() => setVolume(volume > 0 ? 0 : 1)}
            className="text-text-tertiary hover:text-text-secondary"
          >
            {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={e => setVolume(parseFloat(e.target.value))}
            className="flex-1 accent-white"
            style={{
              background: `linear-gradient(to right, rgba(255,255,255,0.8) ${volume * 100}%, rgba(255,255,255,0.2) ${volume * 100}%)`
            }}
          />
        </div>
      </div>
    </div>
  )
}
