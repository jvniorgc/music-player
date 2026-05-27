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

  // Gapless playback: preloaded next track ready to play instantly
  private nextAudio: HTMLAudioElement | null = null
  private nextTrackIndex: number | null = null
  private nextTrackReady = false

  constructor() {
    this.audio = new Audio()
    this.audio.preload = 'auto'
    this.attachAudioListeners(this.audio)

    // Load persisted volume
    const savedVol = localStorage.getItem('player_volume')
    if (savedVol) {
      this._volume = parseFloat(savedVol)
      this.audio.volume = this._volume
    }
  }

  private attachAudioListeners(audio: HTMLAudioElement) {
    audio.addEventListener('timeupdate', () => {
      if (audio !== this.audio) return
      this.emit('timeupdate', {
        currentTime: audio.currentTime,
        duration: audio.duration || 0
      })
    })

    audio.addEventListener('ended', () => {
      if (audio !== this.audio) return
      this.emit('ended')
      this.handleTrackEnded()
    })

    audio.addEventListener('playing', () => {
      if (audio !== this.audio) return
      this.emit('playing')
    })
    audio.addEventListener('pause', () => {
      if (audio !== this.audio) return
      this.emit('pause')
    })
    audio.addEventListener('waiting', () => {
      if (audio !== this.audio) return
      this.emit('buffering', true)
    })
    audio.addEventListener('canplay', () => {
      if (audio !== this.audio) return
      this.emit('buffering', false)
    })

    audio.addEventListener('error', () => {
      if (audio !== this.audio) return
      const err = audio.error
      console.error('[Playback] Audio error:', err?.code, err?.message, 'src:', audio.src?.substring(0, 100))
      this.emit('error', err?.message || 'Playback error')
    })
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

      // Preload next track for gapless playback
      this.preloadNext()

      // Preload lyrics for upcoming tracks
      this.preloadUpcomingLyrics()
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

  private playPreloadedTrack(index: number) {
    if (!this.nextAudio || !this.nextTrackReady) return false

    const track = this._queue[index]
    if (!track) return false

    // Stop current audio
    const oldAudio = this.audio
    oldAudio.pause()
    oldAudio.src = ''

    // Swap to the preloaded audio element
    this.audio = this.nextAudio
    this.nextAudio = null
    this.nextTrackIndex = null
    this.nextTrackReady = false
    this._currentIndex = index

    // Apply current volume
    this.audio.volume = this._volume

    this.emit('trackchange', track)

    // Play immediately — no async gap
    this.audio.play().then(() => {
      console.log('[Playback] Gapless transition to:', track.item.Name)

      jellyfin.reportPlaybackStart(track.id).catch(() => {})

      if (track.source === 'stream') {
        this.cacheCurrentTrack(track)
      }

      // Preload the next-next track
      this.preloadNext()
      this.preloadUpcomingLyrics()
    }).catch((err) => {
      console.error('[Playback] Gapless play failed, falling back:', err)
      this.playTrack(index)
    })

    return true
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
    if (nextIndex === null || !this._queue[nextIndex]) {
      this.invalidatePreload()
      return
    }

    // Already preloading this track
    if (this.nextTrackIndex === nextIndex && this.nextAudio) return

    this.invalidatePreload()

    const nextTrack = this._queue[nextIndex]
    const audio = new Audio()
    audio.preload = 'auto'
    audio.volume = this._volume
    this.attachAudioListeners(audio)
    this.nextAudio = audio
    this.nextTrackIndex = nextIndex

    this.resolveSource(nextTrack).then(url => {
      // Verify this preload is still valid
      if (this.nextAudio !== audio) return

      audio.src = url
      audio.load()

      audio.addEventListener('canplay', () => {
        if (this.nextAudio === audio) {
          this.nextTrackReady = true
          console.log('[Playback] Next track preloaded and ready:', nextTrack.item.Name)
        }
      }, { once: true })

      audio.addEventListener('error', () => {
        console.warn('[Playback] Preload failed for:', nextTrack.item.Name)
        if (this.nextAudio === audio) {
          this.invalidatePreload()
        }
      }, { once: true })
    }).catch(() => {
      if (this.nextAudio === audio) {
        this.invalidatePreload()
      }
    })
  }

  private invalidatePreload() {
    if (this.nextAudio) {
      this.nextAudio.src = ''
      this.nextAudio = null
    }
    this.nextTrackIndex = null
    this.nextTrackReady = false
  }

  private getUpcomingTrackIds(count: number): string[] {
    const ids: string[] = []
    const visited = new Set<number>()
    let idx = this._currentIndex

    for (let i = 0; i < count; i++) {
      if (this._shuffle) {
        const shufflePos = this._shuffleOrder.indexOf(idx)
        const nextPos = shufflePos + 1
        if (nextPos < this._shuffleOrder.length) {
          idx = this._shuffleOrder[nextPos]
        } else if (this._repeat === 'all') {
          idx = this._shuffleOrder[0]
        } else {
          break
        }
      } else {
        idx = idx + 1
        if (idx >= this._queue.length) {
          if (this._repeat === 'all') idx = 0
          else break
        }
      }

      if (visited.has(idx)) break
      visited.add(idx)
      if (this._queue[idx]) ids.push(this._queue[idx].id)
    }
    return ids
  }

  private preloadUpcomingLyrics() {
    const ids = this.getUpcomingTrackIds(3)
    for (const id of ids) {
      jellyfin.getLyricsWithCache(id).catch(() => {})
    }
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
    this.invalidatePreload()
    this.preloadNext()
    this.emit('queuechange', this._queue)
  }

  removeFromQueue(index: number) {
    if (index === this._currentIndex) return
    this._queue.splice(index, 1)
    if (index < this._currentIndex) this._currentIndex--
    if (this._shuffle) this.generateShuffleOrder()
    this.invalidatePreload()
    this.preloadNext()
    this.emit('queuechange', this._queue)
  }

  clearQueue() {
    this.audio.pause()
    this.audio.src = ''
    this.invalidatePreload()
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
    this.invalidatePreload()
    this.preloadNext()
    this.emit('shufflechange', this._shuffle)
  }

  toggleRepeat() {
    const modes: RepeatMode[] = ['none', 'all', 'one']
    const idx = modes.indexOf(this._repeat)
    this._repeat = modes[(idx + 1) % modes.length]
    this.invalidatePreload()
    this.preloadNext()
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
    if (nextIndex === null) {
      this.emit('queueend')
      return
    }

    // Use preloaded audio for gapless transition
    if (this.nextTrackIndex === nextIndex && this.nextTrackReady) {
      this.playPreloadedTrack(nextIndex)
    } else {
      this.playTrack(nextIndex)
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
