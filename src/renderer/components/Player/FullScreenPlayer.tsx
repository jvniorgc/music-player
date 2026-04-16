import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayerStore } from '../../stores/player'
import { playback } from '../../services/playback'
import { jellyfin } from '../../services/jellyfin'
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1,
  ChevronDown, Volume2, VolumeX, ListMusic
} from 'lucide-react'

function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

interface LyricLine {
  Text: string
  Start?: number
}

export default function FullScreenPlayer() {
  const navigate = useNavigate()
  const {
    currentTrack, isPlaying, currentTime, duration, volume, shuffle, repeat,
    togglePlay, next, previous, seek, setVolume, toggleShuffle, toggleRepeat,
    setShowFullScreen
  } = usePlayerStore()

  const [lyrics, setLyrics] = useState<LyricLine[]>([])
  const [hasLyrics, setHasLyrics] = useState(false)
  const [activeLyricIndex, setActiveLyricIndex] = useState(-1)
  const lyricsContainerRef = useRef<HTMLDivElement>(null)
  const activeLyricRef = useRef<HTMLParagraphElement>(null)
  const lastTrackIdRef = useRef<string | null>(null)
  const lyricsRef = useRef<LyricLine[]>([])
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowFullScreen(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [setShowFullScreen])

  // Fetch lyrics when track changes
  useEffect(() => {
    if (!currentTrack) return
    const item = currentTrack.item
    if (lastTrackIdRef.current === item.Id) return
    lastTrackIdRef.current = item.Id

    setLyrics([])
    setHasLyrics(false)
    setActiveLyricIndex(-1)
    lyricsRef.current = []

    // Always try to fetch lyrics (Jellyfin embedded + LRCLIB fallback)
    jellyfin.getLyrics(item.Id).then(lines => {
      const filtered = lines.filter(l => l.Text.trim())
      setLyrics(filtered)
      lyricsRef.current = filtered
      setHasLyrics(filtered.length > 0)
    })
  }, [currentTrack])

  // High-frequency sync loop: read audio currentTime directly at ~60fps
  useEffect(() => {
    let prevIndex = -1
    const tick = () => {
      const lines = lyricsRef.current
      const isTimed = lines.length > 0 && lines[0].Start !== undefined
      if (isTimed) {
        const currentTicks = playback.currentTime * 10000000
        let idx = -1
        for (let i = lines.length - 1; i >= 0; i--) {
          if (lines[i].Start !== undefined && lines[i].Start! <= currentTicks) {
            idx = i
            break
          }
        }
        if (idx !== prevIndex) {
          prevIndex = idx
          setActiveLyricIndex(idx)
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  // Auto-scroll when active lyric changes
  useEffect(() => {
    if (hasLyrics && activeLyricRef.current && lyricsContainerRef.current) {
      activeLyricRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [activeLyricIndex, hasLyrics])

  if (!currentTrack) return null
  const item = currentTrack.item

  const imageUrl = item.AlbumId
    ? jellyfin.getImageUrl(item.AlbumId, item.ImageTags?.Primary, 600)
    : item.ImageTags?.Primary
      ? jellyfin.getImageUrl(item.Id, item.ImageTags.Primary, 600)
      : null

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const isTimed = lyrics.length > 0 && lyrics[0].Start !== undefined

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-3xl flex items-center justify-center fade-in">
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

      {/* Main content: side by side when lyrics, centered when not */}
      <div className={`relative z-10 flex items-center gap-12 w-full px-12 h-[80vh] ${hasLyrics ? 'max-w-5xl' : 'max-w-lg justify-center'}`}>
        {/* Left side: Art + Info + Controls */}
        <div className={`flex flex-col items-center shrink-0 ${hasLyrics ? 'w-96' : 'w-full'}`}>
          {/* Album Art */}
          <div className="w-72 h-72 rounded-2xl overflow-hidden shadow-2xl shadow-black/50 mb-8">
            {imageUrl ? (
              <img src={imageUrl} className="w-full h-full object-cover" alt="" />
            ) : (
              <div className="w-full h-full bg-bg-elevated flex items-center justify-center">
                <ListMusic size={64} className="text-text-tertiary" />
              </div>
            )}
          </div>

          {/* Track info */}
          <div className="text-center mb-6 w-full">
            <h2 className="text-xl font-bold truncate">{item.Name}</h2>
            <p className="text-base text-accent mt-1 truncate">
              {item.ArtistItems?.length ? (
                item.ArtistItems.map((a, i) => (
                  <span key={a.Id}>
                    {i > 0 && ', '}
                    <span
                      onClick={() => { setShowFullScreen(false); navigate(`/artist/${a.Id}`) }}
                      className="hover:underline cursor-pointer"
                    >
                      {a.Name}
                    </span>
                  </span>
                ))
              ) : (
                item.AlbumArtist || 'Artista Desconhecido'
              )}
            </p>
            {item.Album && (
              <p
                onClick={() => { if (item.AlbumId) { setShowFullScreen(false); navigate(`/album/${item.AlbumId}`) } }}
                className={`text-sm text-text-secondary mt-1 truncate ${item.AlbumId ? 'hover:underline cursor-pointer hover:text-text-primary transition-colors' : ''}`}
              >
                {item.Album}
              </p>
            )}
          </div>

          {/* Progress */}
          <div className="w-full mb-5">
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
          <div className="flex items-center justify-center gap-6 mb-6">
            <button
              onClick={toggleShuffle}
              className={`p-2 transition-colors ${shuffle ? 'text-accent' : 'text-text-tertiary hover:text-text-secondary'}`}
            >
              <Shuffle size={18} />
            </button>
            <button onClick={previous} className="text-white hover:scale-105 transition-transform p-2">
              <SkipBack size={24} fill="currentColor" />
            </button>
            <button
              onClick={togglePlay}
              className="w-14 h-14 bg-white rounded-full flex items-center justify-center hover:scale-105 transition-transform"
            >
              {isPlaying ? (
                <Pause size={26} className="text-black" fill="currentColor" />
              ) : (
                <Play size={26} className="text-black ml-1" fill="currentColor" />
              )}
            </button>
            <button onClick={next} className="text-white hover:scale-105 transition-transform p-2">
              <SkipForward size={24} fill="currentColor" />
            </button>
            <button
              onClick={toggleRepeat}
              className={`p-2 transition-colors ${repeat !== 'none' ? 'text-accent' : 'text-text-tertiary hover:text-text-secondary'}`}
            >
              {repeat === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
            </button>
          </div>

          {/* Volume */}
          <div className="flex items-center gap-3 w-56">
            <button
              onClick={() => setVolume(volume > 0 ? 0 : 1)}
              className="text-text-tertiary hover:text-text-secondary"
            >
              {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
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

        {/* Right side: Lyrics */}
        {hasLyrics && (
          <div
            ref={lyricsContainerRef}
            className="flex-1 h-full overflow-y-auto lyrics-scroll py-16 mask-fade"
          >
            <div className="flex flex-col gap-5 px-4">
              {lyrics.map((line, i) => {
                const isActive = isTimed && i === activeLyricIndex
                const isPast = isTimed && activeLyricIndex >= 0 && i < activeLyricIndex
                return (
                  <p
                    key={i}
                    ref={isActive ? activeLyricRef : undefined}
                    className={`text-2xl font-bold leading-relaxed transition-all duration-500 ${
                      isTimed
                        ? isActive
                          ? 'text-white scale-[1.02] origin-left'
                          : isPast
                            ? 'text-white/25'
                            : 'text-white/35'
                        : 'text-white/70'
                    }`}
                  >
                    {line.Text}
                  </p>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
