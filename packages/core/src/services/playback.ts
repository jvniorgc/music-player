import { JellyfinItem, jellyfin } from './jellyfin'
import * as lastfm from './lastfm'

export type RepeatMode = 'none' | 'all' | 'one'

export interface QueueTrack {
  id: string
  item: JellyfinItem
  source?: 'stream' | 'cache' | 'download'
  localPath?: string
}

type PlaybackListener = (event: string, data?: any) => void

/**
 * Spotify-style playback engine.
 *
 * The "what plays next" logic is modelled as two overlapping lists, exactly like
 * Spotify:
 *
 *  - Context: the album/playlist/etc. the user told us to play. Held in
 *    `_context` with a play `_order` (identity, or shuffled when shuffle is on)
 *    and an `_orderPos` cursor. Shuffle only ever reorders the context.
 *  - User queue (`_userQueue`): tracks added manually via "Add to queue" /
 *    "Play next". Strict FIFO, always played in insertion order regardless of
 *    shuffle, and CONSUMED (removed) once they finish.
 *
 * Resolution order for the next track: repeat-one → user queue → context.
 * A `_history` stack records played tracks so "previous" can step back through
 * the session without resurrecting already-consumed queue items.
 */
class PlaybackService {
  private audio: HTMLAudioElement
  private listeners: Set<PlaybackListener> = new Set()

  // Context (album/playlist) the current session was started from.
  private _context: QueueTrack[] = []
  private _order: number[] = []
  private _orderPos = -1
  private _contextName = ''

  // Manually-queued tracks (FIFO) and the playback history (for "previous").
  private _userQueue: QueueTrack[] = []
  private _history: QueueTrack[] = []

  // The track currently loaded into the audio element.
  private _current: QueueTrack | null = null

  private _shuffle = false
  private _repeat: RepeatMode = 'none'
  private _volume = 1

  // Last.fm scrobble tracking for the currently playing track.
  private scrobbleItem: JellyfinItem | null = null
  private scrobbleStartedAt = 0
  private scrobbleDone = false

  // Gapless playback: preloaded next track ready to play instantly.
  private _preloadAudio: HTMLAudioElement | null = null
  private _preloadTrack: QueueTrack | null = null
  private _preloadReady = false

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

  get currentTrack(): QueueTrack | null { return this._current }
  /** Manually-queued tracks waiting to play ("Next in queue"). */
  get userQueue(): QueueTrack[] { return [...this._userQueue] }
  /** Remaining context tracks after the current one ("Next from <context>"). */
  get contextUpNext(): QueueTrack[] {
    const out: QueueTrack[] = []
    for (let p = this._orderPos + 1; p < this._order.length; p++) {
      out.push(this._context[this._order[p]])
    }
    return out
  }
  get contextName() { return this._contextName }
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

  /** Resolves and plays whatever is in `_current`. */
  private async loadAndPlayCurrent() {
    const track = this._current
    if (!track) return
    this.finalizeScrobble()

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

      jellyfin.reportPlaybackStart(track.id).catch(() => {})
      this.startScrobbleTracking(track)

      if (track.source === 'stream') {
        this.cacheCurrentTrack(track)
      }

      this.preloadNext()
      this.preloadUpcomingLyrics()
    } catch (err: any) {
      console.error('[Playback] Play error:', err)

      // If direct stream failed, try the universal endpoint as a fallback.
      if (track.source === 'stream') {
        try {
          console.log('[Playback] Retrying with universal endpoint...')
          const fallbackUrl = `${jellyfin.serverUrl}/Audio/${track.id}/universal?UserId=${jellyfin.userId}&api_key=${jellyfin.token}&MaxStreamingBitrate=320000&AudioCodec=aac&TranscodingContainer=ts&TranscodingProtocol=http`
          this.audio.src = fallbackUrl
          this.audio.load()
          await this.audio.play()
          console.log('[Playback] Fallback succeeded')
          this.startScrobbleTracking(track)
          return
        } catch (fallbackErr: any) {
          console.error('[Playback] Fallback also failed:', fallbackErr)
        }
      }

      this.emit('error', err.message)
    }
  }

  /** Instantly swaps to the preloaded element for a gapless transition. */
  private playPreloaded(): boolean {
    if (!this._preloadAudio || !this._preloadReady || !this._current) return false

    const track = this._current
    this.finalizeScrobble()

    // Stop current audio
    const oldAudio = this.audio
    oldAudio.pause()
    oldAudio.src = ''

    // Swap to the preloaded audio element
    this.audio = this._preloadAudio
    this._preloadAudio = null
    this._preloadTrack = null
    this._preloadReady = false
    this.audio.volume = this._volume

    this.emit('trackchange', track)

    this.audio.play().then(() => {
      console.log('[Playback] Gapless transition to:', track.item.Name)
      jellyfin.reportPlaybackStart(track.id).catch(() => {})
      this.startScrobbleTracking(track)
      if (track.source === 'stream') {
        this.cacheCurrentTrack(track)
      }
      this.preloadNext()
      this.preloadUpcomingLyrics()
    }).catch((err) => {
      console.error('[Playback] Gapless play failed, falling back:', err)
      this.loadAndPlayCurrent()
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

  /** The next track that would play, without mutating any list. */
  private peekNext(): QueueTrack | null {
    if (this._repeat === 'one') return this._current
    if (this._userQueue.length > 0) return this._userQueue[0]
    if (this._orderPos + 1 < this._order.length) {
      return this._context[this._order[this._orderPos + 1]]
    }
    if (this._repeat === 'all' && this._order.length > 0) {
      return this._context[this._order[0]]
    }
    return null
  }

  /**
   * Advances to the next track, mutating the queue state (consuming the user
   * queue, moving the context cursor, recording history). Returns the new
   * current track, or null when playback has reached the end.
   */
  private advance(): QueueTrack | null {
    if (this._repeat === 'one') return this._current

    let next: QueueTrack | null = null
    let fromUser = false
    let newPos = this._orderPos

    if (this._userQueue.length > 0) {
      next = this._userQueue[0]
      fromUser = true
    } else if (this._orderPos + 1 < this._order.length) {
      newPos = this._orderPos + 1
      next = this._context[this._order[newPos]]
    } else if (this._repeat === 'all' && this._order.length > 0) {
      newPos = 0
      next = this._context[this._order[0]]
    }

    if (!next) return null

    if (this._current) this._history.push(this._current)
    if (fromUser) {
      this._userQueue.shift()
    } else {
      this._orderPos = newPos
    }
    this._current = next
    return next
  }

  private preloadNext() {
    const next = this.peekNext()
    if (!next) {
      this.invalidatePreload()
      return
    }

    // Already preloading this track
    if (this._preloadTrack && this._preloadTrack.id === next.id && this._preloadAudio) return

    this.invalidatePreload()

    const audio = new Audio()
    audio.preload = 'auto'
    audio.volume = this._volume
    this.attachAudioListeners(audio)
    this._preloadAudio = audio
    this._preloadTrack = next

    this.resolveSource(next).then(url => {
      if (this._preloadAudio !== audio) return

      audio.src = url
      audio.load()

      audio.addEventListener('canplay', () => {
        if (this._preloadAudio === audio) {
          this._preloadReady = true
          console.log('[Playback] Next track preloaded and ready:', next.item.Name)
        }
      }, { once: true })

      audio.addEventListener('error', () => {
        console.warn('[Playback] Preload failed for:', next.item.Name)
        if (this._preloadAudio === audio) {
          this.invalidatePreload()
        }
      }, { once: true })
    }).catch(() => {
      if (this._preloadAudio === audio) {
        this.invalidatePreload()
      }
    })
  }

  private invalidatePreload() {
    if (this._preloadAudio) {
      this._preloadAudio.src = ''
      this._preloadAudio = null
    }
    this._preloadTrack = null
    this._preloadReady = false
  }

  private getUpcomingTrackIds(count: number): string[] {
    const ids: string[] = []
    let uqIdx = 0
    let pos = this._orderPos

    for (let i = 0; i < count; i++) {
      if (uqIdx < this._userQueue.length) {
        ids.push(this._userQueue[uqIdx].id)
        uqIdx++
      } else if (pos + 1 < this._order.length) {
        pos++
        ids.push(this._context[this._order[pos]].id)
      } else {
        break
      }
    }
    return ids
  }

  private preloadUpcomingLyrics() {
    const ids = this.getUpcomingTrackIds(3)
    for (const id of ids) {
      jellyfin.getLyricsWithCache(id).catch(() => {})
    }
  }

  /** Builds the context play order, anchoring `anchorContextIndex` as current. */
  private buildOrder(anchorContextIndex: number) {
    const n = this._context.length
    this._order = Array.from({ length: n }, (_, i) => i)
    if (this._shuffle) {
      for (let i = this._order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this._order[i], this._order[j]] = [this._order[j], this._order[i]]
      }
      const pos = this._order.indexOf(anchorContextIndex)
      if (pos > 0) {
        [this._order[0], this._order[pos]] = [this._order[pos], this._order[0]]
      }
      this._orderPos = n > 0 ? 0 : -1
    } else {
      this._orderPos = n > 0 ? anchorContextIndex : -1
    }
  }

  /** Starts playing a new context (album/playlist). The user queue is preserved. */
  setQueue(items: JellyfinItem[], startIndex = 0, contextName = '') {
    this._context = items.map(item => ({ id: item.Id, item }))
    this._contextName = contextName
    this._history = []
    const start = Math.max(0, Math.min(startIndex, items.length - 1))
    this.buildOrder(start)
    this._current = this._orderPos >= 0 ? this._context[this._order[this._orderPos]] : null
    this.invalidatePreload()
    this.emit('queuechange')
    this.loadAndPlayCurrent()
  }

  /** Appends to the end of the user queue ("Add to queue"). */
  addToQueue(item: JellyfinItem) {
    this._userQueue.push({ id: item.Id, item })
    this.invalidatePreload()
    this.preloadNext()
    this.emit('queuechange')
  }

  /** Inserts at the front of the user queue ("Play next"). */
  addNext(item: JellyfinItem) {
    this._userQueue.unshift({ id: item.Id, item })
    this.invalidatePreload()
    this.preloadNext()
    this.emit('queuechange')
  }

  removeFromUserQueue(index: number) {
    if (index < 0 || index >= this._userQueue.length) return
    this._userQueue.splice(index, 1)
    this.invalidatePreload()
    this.preloadNext()
    this.emit('queuechange')
  }

  /** Removes a track from the context up-next list (index relative to it). */
  removeFromContext(index: number) {
    const pos = this._orderPos + 1 + index
    if (pos <= this._orderPos || pos >= this._order.length) return
    this._order.splice(pos, 1)
    this.invalidatePreload()
    this.preloadNext()
    this.emit('queuechange')
  }

  /** Jumps to a track in the user queue, consuming the ones above it. */
  playUserQueueAt(index: number) {
    if (index < 0 || index >= this._userQueue.length) return
    if (this._current) this._history.push(this._current)
    const removed = this._userQueue.splice(0, index + 1)
    this._current = removed[removed.length - 1]
    this.invalidatePreload()
    this.emit('queuechange')
    this.loadAndPlayCurrent()
  }

  /** Jumps to a track in the context up-next list (index relative to it). */
  playContextAt(index: number) {
    const pos = this._orderPos + 1 + index
    if (pos <= this._orderPos || pos >= this._order.length) return
    if (this._current) this._history.push(this._current)
    this._orderPos = pos
    this._current = this._context[this._order[pos]]
    this.invalidatePreload()
    this.emit('queuechange')
    this.loadAndPlayCurrent()
  }

  clearQueue() {
    this.finalizeScrobble()
    this.scrobbleItem = null
    this.audio.pause()
    this.audio.src = ''
    this.invalidatePreload()
    this._context = []
    this._order = []
    this._orderPos = -1
    this._contextName = ''
    this._userQueue = []
    this._history = []
    this._current = null
    this.emit('trackchange', null)
    this.emit('queuechange')
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
    const anchor = this._orderPos >= 0 ? this._order[this._orderPos] : 0
    this.buildOrder(anchor)
    this.invalidatePreload()
    this.preloadNext()
    this.emit('shufflechange', this._shuffle)
    this.emit('queuechange')
  }

  toggleRepeat() {
    const modes: RepeatMode[] = ['none', 'all', 'one']
    const idx = modes.indexOf(this._repeat)
    this._repeat = modes[(idx + 1) % modes.length]
    this.invalidatePreload()
    this.preloadNext()
    this.emit('repeatchange', this._repeat)
  }

  private handleTrackEnded() {
    this.finalizeScrobble()

    const ended = this._current
    if (ended) {
      const ticks = Math.floor(this.duration * 10_000_000)
      jellyfin.reportPlaybackStopped(ended.id, ticks).catch(() => {})
    }

    const next = this.advance()
    if (!next) {
      this.emit('queueend')
      return
    }
    this.emit('queuechange')

    // Use the preloaded element for a gapless transition when possible.
    if (this._preloadReady && this._preloadTrack && this._preloadTrack.id === next.id) {
      this.playPreloaded()
    } else {
      this.loadAndPlayCurrent()
    }
  }

  private startScrobbleTracking(track: QueueTrack) {
    this.scrobbleItem = track.item
    this.scrobbleStartedAt = Math.floor(Date.now() / 1000)
    this.scrobbleDone = false
    lastfm.nowPlaying(track.item).catch(() => {})
  }

  private finalizeScrobble() {
    const item = this.scrobbleItem
    if (!item || this.scrobbleDone) return
    const played = this.audio.currentTime
    const duration = item.RunTimeTicks ? item.RunTimeTicks / 10_000_000 : this.audio.duration
    if (lastfm.shouldScrobble(played, duration)) {
      this.scrobbleDone = true
      lastfm.scrobble(item, this.scrobbleStartedAt).catch(() => {})
    }
  }

  next() {
    const next = this.advance()
    if (!next) return
    this.emit('queuechange')
    if (this._preloadReady && this._preloadTrack && this._preloadTrack.id === next.id) {
      this.playPreloaded()
    } else {
      this.loadAndPlayCurrent()
    }
  }

  previous() {
    if (this.audio.currentTime > 3) {
      this.seek(0)
      return
    }
    if (this._history.length === 0) {
      this.seek(0)
      return
    }
    const prev = this._history.pop()!
    // Send the current track to the front of the user queue so a later `next`
    // returns to it, instead of resurrecting a consumed queue item.
    if (this._current) this._userQueue.unshift(this._current)
    this._current = prev
    this.invalidatePreload()
    this.emit('queuechange')
    this.loadAndPlayCurrent()
  }
}

export const playback = new PlaybackService()
