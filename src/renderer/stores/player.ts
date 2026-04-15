import { create } from 'zustand'
import { playback, QueueTrack, RepeatMode } from '../services/playback'
import { JellyfinItem } from '../services/jellyfin'

interface PlayerState {
  currentTrack: QueueTrack | null
  queue: QueueTrack[]
  isPlaying: boolean
  isBuffering: boolean
  currentTime: number
  duration: number
  volume: number
  shuffle: boolean
  repeat: RepeatMode
  showFullScreen: boolean
  showQueue: boolean

  // Actions
  playItems: (items: JellyfinItem[], startIndex?: number) => void
  addToQueue: (item: JellyfinItem) => void
  addNext: (item: JellyfinItem) => void
  removeFromQueue: (index: number) => void
  clearQueue: () => void
  togglePlay: () => void
  next: () => void
  previous: () => void
  seek: (time: number) => void
  setVolume: (vol: number) => void
  toggleShuffle: () => void
  toggleRepeat: () => void
  setShowFullScreen: (show: boolean) => void
  setShowQueue: (show: boolean) => void
  initListeners: () => () => void
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  queue: [],
  isPlaying: false,
  isBuffering: false,
  currentTime: 0,
  duration: 0,
  volume: playback.volume,
  shuffle: false,
  repeat: 'none',
  showFullScreen: false,
  showQueue: false,

  playItems: (items, startIndex = 0) => {
    playback.setQueue(items, startIndex)
  },

  addToQueue: (item) => playback.addToQueue(item),
  addNext: (item) => playback.addNext(item),
  removeFromQueue: (index) => playback.removeFromQueue(index),
  clearQueue: () => playback.clearQueue(),

  togglePlay: () => playback.togglePlay(),
  next: () => playback.next(),
  previous: () => playback.previous(),
  seek: (time) => playback.seek(time),

  setVolume: (vol) => {
    playback.setVolume(vol)
    set({ volume: vol })
  },

  toggleShuffle: () => playback.toggleShuffle(),
  toggleRepeat: () => playback.toggleRepeat(),

  setShowFullScreen: (show) => set({ showFullScreen: show }),
  setShowQueue: (show) => set({ showQueue: show }),

  initListeners: () => {
    return playback.on((event, data) => {
      switch (event) {
        case 'trackchange':
          set({
            currentTrack: data,
            queue: [...playback.queue],
            currentTime: 0,
            duration: 0
          })
          if (data && 'mediaSession' in navigator) {
            const item = data.item
            navigator.mediaSession.metadata = new MediaMetadata({
              title: item.Name,
              artist: item.Artists?.join(', ') || item.AlbumArtist || '',
              album: item.Album || ''
            })
          }
          break
        case 'timeupdate':
          set({ currentTime: data.currentTime, duration: data.duration })
          break
        case 'playing':
          set({ isPlaying: true })
          break
        case 'pause':
          set({ isPlaying: false })
          break
        case 'buffering':
          set({ isBuffering: data })
          break
        case 'shufflechange':
          set({ shuffle: data })
          break
        case 'repeatchange':
          set({ repeat: data })
          break
        case 'queuechange':
          set({ queue: [...data] })
          break
        case 'volumechange':
          set({ volume: data })
          break
        case 'queueend':
          set({ isPlaying: false })
          break
      }
    })
  }
}))
