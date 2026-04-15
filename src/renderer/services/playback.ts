import { JellyfinItem, jellyfin } from './jellyfin'

export type RepeatMode = 'none' | 'all' | 'one'

export interface QueueTrack {
  id: string
  item: JellyfinItem
  source?: 'stream' | 'cache' | 'download'
  localPath?: string
}

type PlaybackListener = (event: string, data?: any) => void

class PlaybackService {
  private audio: HTMLAudioElement
  private listeners: Set<PlaybackListener> = new Set()
  private _queue: QueueTrack[] = []
  private _currentIndex = -1
  private _shuffle = false
  private _repeat: RepeatMode = 'none'
  private _shuffleOrder: number[] = []
  private _volume = 1
  private preloadAudio: HTMLAudioElement | null = null

  constructor() {
    this.audio = new Audio()
    this.audio.preload = 'auto'

    this.audio.addEventListener('timeupdate', () => {
      this.emit('timeupdate', {
        currentTime: this.audio.currentTime,
        duration: this.audio.duration || 0
      })
    })

    this.audio.addEventListener('ended', () => {
      this.emit('ended')
      this.handleTrackEnded()
    })

    this.audio.addEventListener('playing', () => this.emit('playing'))
    this.audio.addEventListener('pause', () => this.emit('pause'))
    this.audio.addEventListener('waiting', () => this.emit('buffering', true))
    this.audio.addEventListener('canplay', () => this.emit('buffering', false))

    this.audio.addEventListener('error', () => {
      const err = this.audio.error
      console.error('[Playback] Audio error:', err?.code, err?.message, 'src:', this.audio.src?.substring(0, 100))
      this.emit('error', err?.message || 'Playback error')
    })

    // Load persisted volume
    const savedVol = localStorage.getItem('player_volume')
    if (savedVol) {
      this._volume = parseFloat(savedVol)
      this.audio.volume = this._volume
    }
  }

  on(listener: PlaybackListener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: string, data?: any) {
    this.listeners.forEach(l => l(event, data))
  }

  get queue() { return this._queue }
  get currentIndex() { return this._currentIndex }
  get currentTrack(): QueueTrack | null {
    return this._queue[this._currentIndex] || null
  }
  get isPlaying() { return !this.audio.paused }
  get currentTime() { return this.audio.currentTime }
  get duration() { return this.audio.duration || 0 }
  get volume() { return this._volume }
  get shuffle() { return this._shuffle }
  get repeat() { return this._repeat }

  private async resolveSource(track: QueueTrack): Promise<string> {
    // Check download first
    try {
      const downloadPath = await window.api.getDownloadPath(track.id)
      if (downloadPath) {
        track.source = 'download'
        track.localPath = downloadPath
        return `local-audio://${encodeURIComponent(downloadPath)}`
      }
    } catch (err) {
      console.warn('[Playback] Download check failed:', err)
    }

    // Check cache
    try {
      const cachePath = await window.api.getCachedAudio(track.id)
      if (cachePath) {
        track.source = 'cache'
        track.localPath = cachePath
        return `local-audio://${encodeURIComponent(cachePath)}`
      }
    } catch (err) {
      console.warn('[Playback] Cache check failed:', err)
    }

    // Stream from server
    track.source = 'stream'
    return jellyfin.getStreamUrl(track.id)
  }

  async playTrack(index: number) {
    if (index < 0 || index >= this._queue.length) return
    this._currentIndex = index
    const track = this._queue[index]

    // Emit trackchange immediately so UI updates
    this.emit('trackchange', track)

    try {
      const url = await this.resolveSource(track)
      console.log('[Playback] Playing:', track.item.Name, '| Source:', track.source, '| URL:', url.substring(0, 120))

      this.audio.src = url
      this.audio.load()

      // Wait for the audio to be ready before playing
      await new Promise<void>((resolve, reject) => {
        const onCanPlay = () => { cleanup(); resolve() }
        const onError = () => {
          cleanup()
          reject(new Error(this.audio.error?.message || `Audio load failed (code ${this.audio.error?.code})`))
        }
        const cleanup = () => {
          this.audio.removeEventListener('canplay', onCanPlay)
          this.audio.removeEventListener('error', onError)
        }
        this.audio.addEventListener('canplay', onCanPlay, { once: true })
        this.audio.addEventListener('error', onError, { once: true })
      })

      await this.audio.play()
      console.log('[Playback] Playing successfully')

      // Report to Jellyfin
      jellyfin.reportPlaybackStart(track.id).catch(() => {})

      // Cache audio in background if streaming
      if (track.source === 'stream') {
        this.cacheCurrentTrack(track)
      }

      // Preload next track
      this.preloadNext()
    } catch (err: any) {
      console.error('[Playback] Play error:', err)

      // If direct stream failed, try universal endpoint as fallback
      if (track.source === 'stream') {
        try {
          console.log('[Playback] Retrying with universal endpoint...')
          const fallbackUrl = `${jellyfin.serverUrl}/Audio/${track.id}/universal?UserId=${jellyfin.userId}&api_key=${jellyfin.token}&MaxStreamingBitrate=320000&AudioCodec=aac&TranscodingContainer=ts&TranscodingProtocol=http`
          this.audio.src = fallbackUrl
          this.audio.load()
          await this.audio.play()
          console.log('[Playback] Fallback succeeded')
          return
        } catch (fallbackErr: any) {
          console.error('[Playback] Fallback also failed:', fallbackErr)
        }
      }

      this.emit('error', err.message)
    }
  }

  private async cacheCurrentTrack(track: QueueTrack) {
    try {
      const streamUrl = jellyfin.getStreamUrl(track.id)
      await window.api.cacheAudio({
        itemId: track.id,
        url: streamUrl,
        quality: 'default'
      })
    } catch {}
  }

  private preloadNext() {
    const nextIndex = this.getNextIndex()
    if (nextIndex === null || !this._queue[nextIndex]) return

    const nextTrack = this._queue[nextIndex]
    this.preloadAudio = new Audio()
    this.preloadAudio.preload = 'auto'
    this.resolveSource(nextTrack).then(url => {
      if (this.preloadAudio) {
        this.preloadAudio.src = url
      }
    })
  }

  setQueue(items: JellyfinItem[], startIndex = 0) {
    this._queue = items.map(item => ({ id: item.Id, item }))
    if (this._shuffle) this.generateShuffleOrder()
    this.playTrack(this._shuffle ? this._shuffleOrder[startIndex] : startIndex)
  }

  addToQueue(item: JellyfinItem) {
    this._queue.push({ id: item.Id, item })
    if (this._shuffle) this.generateShuffleOrder()
    this.emit('queuechange', this._queue)
  }

  addNext(item: JellyfinItem) {
    const insertIndex = this._currentIndex + 1
    this._queue.splice(insertIndex, 0, { id: item.Id, item })
    if (this._shuffle) this.generateShuffleOrder()
    this.emit('queuechange', this._queue)
  }

  removeFromQueue(index: number) {
    if (index === this._currentIndex) return
    this._queue.splice(index, 1)
    if (index < this._currentIndex) this._currentIndex--
    if (this._shuffle) this.generateShuffleOrder()
    this.emit('queuechange', this._queue)
  }

  clearQueue() {
    this.audio.pause()
    this.audio.src = ''
    this._queue = []
    this._currentIndex = -1
    this._shuffleOrder = []
    this.emit('trackchange', null)
    this.emit('queuechange', [])
  }

  async play() {
    if (this.audio.src) {
      await this.audio.play()
    }
  }

  pause() {
    this.audio.pause()
  }

  async togglePlay() {
    if (this.audio.paused) {
      await this.play()
    } else {
      this.pause()
    }
  }

  seek(time: number) {
    if (isFinite(time)) {
      this.audio.currentTime = time
    }
  }

  setVolume(vol: number) {
    this._volume = Math.max(0, Math.min(1, vol))
    this.audio.volume = this._volume
    localStorage.setItem('player_volume', String(this._volume))
    this.emit('volumechange', this._volume)
  }

  toggleShuffle() {
    this._shuffle = !this._shuffle
    if (this._shuffle) {
      this.generateShuffleOrder()
    }
    this.emit('shufflechange', this._shuffle)
  }

  toggleRepeat() {
    const modes: RepeatMode[] = ['none', 'all', 'one']
    const idx = modes.indexOf(this._repeat)
    this._repeat = modes[(idx + 1) % modes.length]
    this.emit('repeatchange', this._repeat)
  }

  private generateShuffleOrder() {
    this._shuffleOrder = Array.from({ length: this._queue.length }, (_, i) => i)
    for (let i = this._shuffleOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this._shuffleOrder[i], this._shuffleOrder[j]] = [this._shuffleOrder[j], this._shuffleOrder[i]]
    }
    // Ensure current track is first in shuffle
    if (this._currentIndex >= 0) {
      const pos = this._shuffleOrder.indexOf(this._currentIndex)
      if (pos > 0) {
        [this._shuffleOrder[0], this._shuffleOrder[pos]] = [this._shuffleOrder[pos], this._shuffleOrder[0]]
      }
    }
  }

  private getNextIndex(): number | null {
    if (this._queue.length === 0) return null

    if (this._repeat === 'one') return this._currentIndex

    if (this._shuffle) {
      const currentShufflePos = this._shuffleOrder.indexOf(this._currentIndex)
      const nextShufflePos = currentShufflePos + 1
      if (nextShufflePos < this._shuffleOrder.length) {
        return this._shuffleOrder[nextShufflePos]
      }
      return this._repeat === 'all' ? this._shuffleOrder[0] : null
    }

    const next = this._currentIndex + 1
    if (next < this._queue.length) return next
    return this._repeat === 'all' ? 0 : null
  }

  private getPrevIndex(): number | null {
    if (this._queue.length === 0) return null

    if (this._shuffle) {
      const currentShufflePos = this._shuffleOrder.indexOf(this._currentIndex)
      if (currentShufflePos > 0) return this._shuffleOrder[currentShufflePos - 1]
      return this._repeat === 'all' ? this._shuffleOrder[this._shuffleOrder.length - 1] : null
    }

    if (this._currentIndex > 0) return this._currentIndex - 1
    return this._repeat === 'all' ? this._queue.length - 1 : null
  }

  private handleTrackEnded() {
    if (this.currentTrack) {
      const ticks = Math.floor(this.duration * 10_000_000)
      jellyfin.reportPlaybackStopped(this.currentTrack.id, ticks).catch(() => {})
    }

    const nextIndex = this.getNextIndex()
    if (nextIndex !== null) {
      this.playTrack(nextIndex)
    } else {
      this.emit('queueend')
    }
  }

  next() {
    const nextIndex = this.getNextIndex()
    if (nextIndex !== null) this.playTrack(nextIndex)
  }

  previous() {
    if (this.audio.currentTime > 3) {
      this.seek(0)
      return
    }
    const prevIndex = this.getPrevIndex()
    if (prevIndex !== null) this.playTrack(prevIndex)
  }
}

export const playback = new PlaybackService()
