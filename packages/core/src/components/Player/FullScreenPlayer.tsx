import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayerStore } from '../../stores/player'
import { useShallow } from 'zustand/react/shallow'
import { playback } from '../../services/playback'
import { jellyfin } from '../../services/jellyfin'
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1,
  ChevronDown, Volume2, VolumeX, ListMusic, Captions, CaptionsOff
} from 'lucide-react'
import ArtworkBackground from './ArtworkBackground'
import { ArtistLinks, AlbumLink, PlayingFrom } from '../UI/Links'
import { formatTime, TICKS_PER_SECOND } from '../../lib/format'
import { useT } from '../../i18n'
import { useInterfacePrefs, LYRICS_SIZE_CLASS } from '../../stores/prefs/interface'

interface LyricLine {
  Text: string
  Start?: number
}

export default function FullScreenPlayer() {
  const navigate = useNavigate()
  const { t } = useT()
  const lyricsSize = useInterfacePrefs(s => s.values.lyricsSize)
  const {
    currentTrack, isPlaying, volume, shuffle, repeat,
    togglePlay, next, previous, setVolume, toggleShuffle, toggleRepeat,
    setShowFullScreen
  } = usePlayerStore(useShallow(s => ({
    currentTrack: s.currentTrack, isPlaying: s.isPlaying, volume: s.volume, shuffle: s.shuffle,
    repeat: s.repeat, togglePlay: s.togglePlay, next: s.next, previous: s.previous,
    setVolume: s.setVolume, toggleShuffle: s.toggleShuffle, toggleRepeat: s.toggleRepeat,
    setShowFullScreen: s.setShowFullScreen,
  })))

  const [lyrics, setLyrics] = useState<LyricLine[]>([])
  const [hasLyrics, setHasLyrics] = useState(false)
  const [showLyrics, setShowLyrics] = useState(true)
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

    // Always try to fetch lyrics (cache-first, then Jellyfin embedded + LRCLIB fallback)
    jellyfin.getLyricsWithCache(item.Id).then(lines => {
      // Discard stale responses that resolve after the track has changed
      if (lastTrackIdRef.current !== item.Id) return
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
        const currentTicks = playback.currentTime * TICKS_PER_SECOND
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
    if (showLyrics && hasLyrics && activeLyricRef.current && lyricsContainerRef.current) {
      activeLyricRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [activeLyricIndex, hasLyrics, showLyrics])

  if (!currentTrack) return null
  const item = currentTrack.item

  const imageUrl = item.AlbumId
    ? jellyfin.getImageUrl(item.AlbumId, item.ImageTags?.Primary, 600)
    : item.ImageTags?.Primary
      ? jellyfin.getImageUrl(item.Id, item.ImageTags.Primary, 600)
      : null

  const isTimed = lyrics.length > 0 && lyrics[0].Start !== undefined
  const lyricsVisible = hasLyrics && showLyrics

  return (
    <div className="theme-dark fixed inset-0 z-50 flex items-center justify-center fade-in">
      <ArtworkBackground imageUrl={imageUrl} />


      {/* Close button */}
      <button
        onClick={() => setShowFullScreen(false)}
        aria-label={t('player.close')}
        title={t('player.close')}
        className="absolute top-6 left-1/2 -translate-x-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-10 no-drag"
      >
        <ChevronDown size={20} />
      </button>

      {/* Lyrics visibility toggle (only when the track has lyrics) */}
      {hasLyrics && (
        <button
          onClick={() => setShowLyrics(v => !v)}
          aria-label={t('player.toggleLyrics')}
          title={showLyrics ? t('player.hideLyrics') : t('player.showLyrics')}
          className={`absolute top-6 right-6 p-2 rounded-full transition-colors z-10 no-drag ${
            showLyrics ? 'bg-white/20 text-white' : 'bg-white/10 text-text-tertiary hover:bg-white/20'
          }`}
        >
          {showLyrics ? <Captions size={20} /> : <CaptionsOff size={20} />}
        </button>
      )}

      {/* Main content: side by side when lyrics, centered when not */}
      <div className={`relative z-10 flex items-center gap-6 md:gap-12 w-full px-6 md:px-12 h-[80vh] ${lyricsVisible ? 'max-w-5xl' : 'max-w-lg justify-center'}`}>
        {/* Left side: Art + Info + Controls */}
        <div className={`flex flex-col items-center min-w-0 mx-auto w-full ${lyricsVisible ? 'md:mx-0 md:shrink-0 md:w-96' : ''}`}>
          {/* Album Art */}
          <div data-testid="album-art" className="w-[min(18rem,35vh)] max-w-full aspect-square rounded-lg overflow-hidden shadow-lg shadow-black/50 mb-4 md:mb-8">
            {imageUrl ? (
              <img src={imageUrl} className="w-full h-full object-cover" alt="" />
            ) : (
              <div className="w-full h-full bg-surface-2 flex items-center justify-center">
                <ListMusic size={64} className="text-text-tertiary" />
              </div>
            )}
          </div>

          {/* Track info */}
          <div className="text-center mb-3 md:mb-6 w-full">
            <PlayingFrom className="mb-2" />
            <h2 className="text-xl font-semibold truncate">{item.Name}</h2>
            <p className="text-base text-accent mt-1 truncate">
              <ArtistLinks item={item} fallback={t('player.unknownArtist')} />
            </p>
            {item.Album && (
              <p className="text-sm text-text-secondary mt-1 truncate">
                <AlbumLink item={item} />
              </p>
            )}
          </div>

          <SeekBar />

          {/* Controls */}
          <div className="flex items-center justify-center gap-6 mb-3 md:mb-6">
            <button
              onClick={toggleShuffle}
              aria-label={t('player.shuffle')}
              title={t('player.shuffle')}
              aria-pressed={shuffle}
              className={`p-2 transition-colors ${shuffle ? 'text-accent' : 'text-text-tertiary hover:text-text-secondary'}`}
            >
              <Shuffle size={18} />
            </button>
            <button onClick={previous} aria-label={t('player.previous')} title={t('player.previous')} className="text-white hover:opacity-80 active:opacity-60 transition-opacity p-2">
              <SkipBack size={24} fill="currentColor" />
            </button>
            <button
              onClick={togglePlay}
              aria-label={isPlaying ? t('player.pause') : t('player.play')}
              className="w-14 h-14 bg-white rounded-full flex items-center justify-center hover:opacity-80 active:opacity-60 transition-opacity"
            >
              {isPlaying ? (
                <Pause size={26} className="text-black" fill="currentColor" />
              ) : (
                <Play size={26} className="text-black ml-1" fill="currentColor" />
              )}
            </button>
            <button onClick={next} aria-label={t('player.next')} title={t('player.next')} className="text-white hover:opacity-80 active:opacity-60 transition-opacity p-2">
              <SkipForward size={24} fill="currentColor" />
            </button>
            <button
              onClick={toggleRepeat}
              aria-label={t('player.repeat')}
              title={t('player.repeat')}
              className={`p-2 transition-colors ${repeat !== 'none' ? 'text-accent' : 'text-text-tertiary hover:text-text-secondary'}`}
            >
              {repeat === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
            </button>
          </div>

          {/* Volume */}
          <div className="flex items-center gap-3 w-56 max-w-full">
            <button
              onClick={() => setVolume(volume > 0 ? 0 : 1)}
              aria-label={volume === 0 ? t('player.unmute') : t('player.mute')}
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
              aria-label={t('player.volume')}
              className="flex-1 accent-white"
              style={{
                background: `linear-gradient(to right, rgba(255,255,255,0.8) ${volume * 100}%, rgba(255,255,255,0.2) ${volume * 100}%)`
              }}
            />
          </div>
        </div>

        {/* Right side: Lyrics (hidden on narrow windows so controls keep their space) */}
        {lyricsVisible && (
          <div
            data-testid="lyrics-panel"
            ref={lyricsContainerRef}
            className="hidden md:block flex-1 h-full overflow-y-auto lyrics-scroll py-16 mask-fade"
          >
            <div className="flex flex-col gap-5 px-4">
              {lyrics.map((line, i) => {
                const isActive = isTimed && i === activeLyricIndex
                const isPast = isTimed && activeLyricIndex >= 0 && i < activeLyricIndex
                return (
                  <p
                    key={i}
                    ref={isActive ? activeLyricRef : undefined}
                    className={`${LYRICS_SIZE_CLASS[lyricsSize]} font-semibold leading-relaxed transition-all duration-500 ${
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

/** Seek slider + elapsed/remaining time; isolated so playback ticks only re-render this. */
function SeekBar() {
  const { t } = useT()
  const currentTime = usePlayerStore(s => s.currentTime)
  const duration = usePlayerStore(s => s.duration)
  const seek = usePlayerStore(s => s.seek)
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="w-full mb-3 md:mb-5">
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={currentTime}
        onChange={e => seek(parseFloat(e.target.value))}
        aria-label={t('player.seek')}
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
  )
}
