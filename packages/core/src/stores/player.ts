import { create } from 'zustand'
import { useToastStore } from './toast'
import { playback, QueueTrack, RepeatMode, PlaybackContext } from '../services/playback'
import { JellyfinItem, jellyfin } from '../services/jellyfin'
import { getRecommendations } from '../services/recommendations'

interface PlayerState {
  currentTrack: QueueTrack | null
  /** Manually-queued tracks ("Next in queue"). */
  userQueue: QueueTrack[]
  /** Remaining context tracks ("Next from <context>"). */
  contextUpNext: QueueTrack[]
  contextName: string
  context: PlaybackContext | null
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
  /** Plays `items` as the current context, starting at `startIndex`. */
  playItems: (items: JellyfinItem[], startIndex?: number, context?: PlaybackContext | string) => void
  /** Plays `items` with shuffle turned on, from a random track. */
  shuffleItems: (items: JellyfinItem[], context?: PlaybackContext | string) => void
  /** "Shuffle all": random songs from the whole library. */
  shuffleAllSongs: () => Promise<void>
  /** "Instant mix": a queue generated from recent listening; returns how many tracks were queued. */
  startRadio: () => Promise<number>
  /** "Start radio" for one track (Jellyfin InstantMix); returns how many tracks were queued. */
  startTrackRadio: (item: JellyfinItem) => Promise<number>
  addToQueue: (item: JellyfinItem) => void
  addNext: (item: JellyfinItem) => void
  addItemsToQueue: (items: JellyfinItem[]) => void
  addItemsNext: (items: JellyfinItem[]) => void
  removeFromUserQueue: (index: number) => void
  removeFromContext: (index: number) => void
  playUserQueueAt: (index: number) => void
  playContextAt: (index: number) => void
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

export const usePlayerStore = create<PlayerState>((set) => ({
  currentTrack: null,
  userQueue: [],
  contextUpNext: [],
  contextName: '',
  context: null,
  isPlaying: false,
  isBuffering: false,
  currentTime: 0,
  duration: 0,
  volume: playback.volume,
  shuffle: false,
  repeat: 'none',
  showFullScreen: false,
  showQueue: false,

  playItems: (items, startIndex = 0, context = '') => {
    playback.setQueue(items, startIndex, context)
  },

  shuffleItems: (items, context = '') => {
    if (items.length > 0) playback.setQueue(items, 0, context, { shuffle: true })
  },

  shuffleAllSongs: async () => {
    const res = await jellyfin.getRandomSongs()
    if (res.Items.length > 0) {
      playback.setQueue(res.Items, 0, { type: 'library', name: 'Your library' })
    }
  },

  startRadio: async () => {
    const items = await getRecommendations()
    if (items.length > 0) {
      playback.setQueue(items, 0, { type: 'mix', name: 'Instant mix' })
    }
    return items.length
  },

  startTrackRadio: async (item) => {
    const res = await jellyfin.getInstantMix(item.Id)
    const rest = res.Items.filter(i => i.Id !== item.Id)
    playback.setQueue([item, ...rest], 0, { type: 'radio', id: item.Id, name: `${item.Name} radio` })
    return rest.length + 1
  },

  addToQueue: (item) => playback.addToQueue(item),
  addNext: (item) => playback.addNext(item),
  addItemsToQueue: (items) => playback.addItemsToQueue(items),
  addItemsNext: (items) => playback.addItemsNext(items),
  removeFromUserQueue: (index) => playback.removeFromUserQueue(index),
  removeFromContext: (index) => playback.removeFromContext(index),
  playUserQueueAt: (index) => playback.playUserQueueAt(index),
  playContextAt: (index) => playback.playContextAt(index),
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
    // Mirror the engine's two queue lists into store state.
    const syncQueue = () => set({
      userQueue: [...playback.userQueue],
      contextUpNext: [...playback.contextUpNext],
      contextName: playback.contextName,
      context: playback.context
    })

    // Set up Media Session action handlers for OS media controls
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => playback.togglePlay())
      navigator.mediaSession.setActionHandler('pause', () => playback.togglePlay())
      navigator.mediaSession.setActionHandler('previoustrack', () => playback.previous())
      navigator.mediaSession.setActionHandler('nexttrack', () => playback.next())
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime != null) playback.seek(details.seekTime)
      })
    }

    return playback.on((event, data) => {
      switch (event) {
        case 'trackchange':
          set({ currentTrack: data, currentTime: 0, duration: 0 })
          syncQueue()
          if (data && 'mediaSession' in navigator) {
            const item = data.item
            const artworkId = item.AlbumId || item.Id
            const artworkUrl = artworkId ? jellyfin.getImageUrl(artworkId, item.ImageTags?.Primary, 512) : undefined
            navigator.mediaSession.metadata = new MediaMetadata({
              title: item.Name,
              artist: item.Artists?.join(', ') || item.AlbumArtist || '',
              album: item.Album || '',
              artwork: artworkUrl ? [
                { src: artworkUrl, sizes: '512x512', type: 'image/jpeg' }
              ] : undefined
            })
          }
          break
        case 'timeupdate':
          set({ currentTime: data.currentTime, duration: data.duration })
          if ('mediaSession' in navigator && data.duration > 0) {
            navigator.mediaSession.setPositionState({
              duration: data.duration,
              position: Math.min(data.currentTime, data.duration),
              playbackRate: 1
            })
          }
          break
        case 'playing':
          set({ isPlaying: true })
          if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
          break
        case 'pause':
          set({ isPlaying: false })
          if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
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
          syncQueue()
          break
        case 'error':
          useToastStore.getState().show(String(data || 'Playback error'), 'error')
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
