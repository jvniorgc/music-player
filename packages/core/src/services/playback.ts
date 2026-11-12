import { JellyfinItem, jellyfin } from './jellyfin'
import * as lastfm from './lastfm'
import { audioEffects } from './audioEffects'
import { audioOutput } from './audioOutput'
import { t } from '../i18n'
import { secondsToTicks, ticksToSeconds } from '../lib/format'
import { usePlaybackPrefs } from '../stores/prefs/playback'

export type RepeatMode = 'none' | 'all' | 'one'

export interface QueueTrack {
  id: string
  item: JellyfinItem
  source?: 'stream' | 'cache' | 'download'
  localPath?: string
}

/** Where the current queue was started from ("Playing from <name>"). */
export type PlaybackContextType =
  | 'album' | 'playlist' | 'artist' | 'songs' | 'search' | 'home' | 'library' | 'mix' | 'radio' | 'downloads' | 'liked' | 'custom'

export interface PlaybackContext {
  type: PlaybackContextType
  /** Album/playlist/artist id, or the query for a search context. */
  id?: string
  name: string
}

/** Everything needed to rebuild the queue on the next launch (see lib/session.ts). */
export interface PlaybackSnapshot {
  current: JellyfinItem
  /** Context tracks in play order. */
  items: JellyfinItem[]
  /** Position of the context cursor within `items` (-1 when none). */
  position: number
  userQueue: JellyfinItem[]
  time: number
  shuffle: boolean
  repeat: RepeatMode
  context: PlaybackContext | null
}

function toContext(context: PlaybackContext | string | null | undefined): PlaybackContext | null {
  if (!context) return null
  return typeof context === 'string' ? { type: 'custom', name: context } : context
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
  private _contextInfo: PlaybackContext | null = null
  // Set by restoreSnapshot(): the track is loaded paused and its "start"
  // side-effects (report/scrobble/preload) run on the first play().
  private _pendingStart = false

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

  // Crossfade: the outgoing element while it fades out.
  private _fadingAudio: HTMLAudioElement | null = null
  private _fadeTimer: ReturnType<typeof setInterval> | null = null

  // Failure handling: skip unplayable tracks, but stop after a few in a row
  // (e.g. server down) instead of burning through the whole queue.
  private _loading = false
  private _loadSeq = 0
  private _consecutiveFailures = 0
  private _resumeOnOnline: { trackId: string; position: number } | null = null
  static readonly MAX_CONSECUTIVE_FAILURES = 3

  constructor() {
    this.audio = new Audio()
    this.audio.preload = 'auto'
    this.attachAudioListeners(this.audio)
    audioEffects.register(this.audio)

    // Load persisted volume
    const savedVol = localStorage.getItem('player_volume')
    if (savedVol) {
      this._volume = parseFloat(savedVol)
      this.audio.volume = audioOutput.effectiveVolume(this._volume)
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleOnline())
    }
  }

  private isOffline(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine === false
  }

  /** Network came back: resume a stream that died while offline. */
  private handleOnline() {
    const pending = this._resumeOnOnline
    this._resumeOnOnline = null
    if (!pending || this._current?.id !== pending.trackId) return
    console.warn('[Playback] Network restored, resuming', pending.trackId)
    this.loadAndPlayCurrent(pending.position)
  }

  /**
   * A track could not be played. Surface it, then skip ahead unless we're
   * offline (wait for the network) or too many tracks failed in a row.
   */
  private handlePlaybackFailure(track: QueueTrack, message: string, position = 0) {
    if (this._current !== track) return // user already moved on
    const name = track.item.Name || t('playback.trackFallback')
    if (this.isOffline() && track.source === 'stream') {
      this._resumeOnOnline = { trackId: track.id, position }
      this.emit('error', t('playback.connectionLost', { name }))
      return
    }
    this._consecutiveFailures++
    if (this._consecutiveFailures >= PlaybackService.MAX_CONSECUTIVE_FAILURES) {
      this._consecutiveFailures = 0
      this.emit('error', t('playback.stopped', { message }))
      return
    }
    this.emit('error', t('playback.skipping', { name }))
    if (this.peekNext() && this.peekNext() !== track) this.next()
  }

  private attachAudioListeners(audio: HTMLAudioElement) {
    audio.addEventListener('timeupdate', () => {
      if (audio !== this.audio) return
      this.emit('timeupdate', {
        currentTime: audio.currentTime,
        duration: audio.duration || 0
      })
      this.maybeCrossfade(audio)
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
      if (audio !== this.audio || !audio.src) return
      const err = audio.error
      console.error('[Playback] Audio error:', err?.code, err?.message, 'src:', audio.src?.substring(0, 100))
      // Errors during the initial load are handled by loadAndPlayCurrent.
      if (this._loading || !this._current) return
      this.handlePlaybackFailure(this._current, err?.message || t('playback.error'), audio.currentTime)
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
  get contextName() { return this._contextInfo?.name ?? '' }
  get context(): PlaybackContext | null { return this._contextInfo }
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
  private async loadAndPlayCurrent(startAt = 0) {
    const track = this._current
    if (!track) return
    this.finalizeScrobble()
    this.cancelFade()
    this._resumeOnOnline = null
    this._pendingStart = false

    // Emit trackchange immediately so UI updates
    this.emit('trackchange', track)

    const loadId = ++this._loadSeq
    this._loading = true
    try {
      const url = await this.resolveSource(track)

      audioEffects.setTrackGain(this.audio, track.item.NormalizationGain)
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

      if (this._current !== track) return // superseded by a newer load
      if (startAt > 0) this.audio.currentTime = startAt
      await this.audio.play()
      this._loading = false
      this._consecutiveFailures = 0

      jellyfin.reportPlaybackStart(track.id).catch(err => console.warn('[Playback] reportPlaybackStart failed:', err))
      this.startScrobbleTracking(track)

      if (track.source === 'stream') {
        this.cacheCurrentTrack(track)
      }

      this.preloadNext()
      this.preloadUpcomingLyrics()
    } catch (err) {
      console.error('[Playback] Play error:', err)
      if (this._current !== track) return // superseded; not this track's problem

      // If direct stream failed, try the universal endpoint as a fallback.
      if (track.source === 'stream' && !this.isOffline()) {
        try {
          const fallbackUrl = `${jellyfin.serverUrl}/Audio/${track.id}/universal?UserId=${jellyfin.userId}&ApiKey=${jellyfin.token}&MaxStreamingBitrate=320000&AudioCodec=aac&TranscodingContainer=ts&TranscodingProtocol=http`
          this.audio.src = fallbackUrl
          this.audio.load()
          await this.audio.play()
          this._consecutiveFailures = 0
          this.startScrobbleTracking(track)
          return
        } catch (fallbackErr) {
          console.error('[Playback] Fallback also failed:', fallbackErr)
        }
      }

      this.handlePlaybackFailure(track, err instanceof Error ? err.message : String(err), startAt)
    } finally {
      if (loadId === this._loadSeq) this._loading = false
    }
  }

  private get prefs() { return usePlaybackPrefs.getState().values }

  /** Stops an in-progress crossfade, discarding the outgoing element. */
  private cancelFade() {
    if (this._fadeTimer) clearInterval(this._fadeTimer)
    this._fadeTimer = null
    const old = this._fadingAudio
    if (!old) return
    this._fadingAudio = null
    old.pause()
    old.src = ''
    audioEffects.unregister(old)
    this.audio.volume = this._volume
  }

  /** Starts a crossfade into the preloaded track when the current one nears its end. */
  private maybeCrossfade(audio: HTMLAudioElement) {
    const fade = this.prefs.crossfade
    if (fade <= 0 || this._fadingAudio || !this._preloadReady || !this._preloadTrack) return
    const remaining = (audio.duration || 0) - audio.currentTime
    if (!(remaining > 0 && remaining <= fade)) return
    if (this.peekNext()?.id !== this._preloadTrack.id || this._repeat === 'one') return

    const ended = this._current!
    jellyfin.reportPlaybackStopped(ended.id, secondsToTicks(this.duration)).catch(err => console.warn('[Playback] reportPlaybackStopped failed:', err))
    this.advance()
    this.emit('queuechange')
    this.playPreloaded(remaining)
  }

  /** Swaps to the preloaded element: instantly (gapless) or crossfading over `fade` seconds. */
  private playPreloaded(fade = 0): boolean {
    if (!this._preloadAudio || !this._preloadReady || !this._current) return false

    const track = this._current
    this.finalizeScrobble()
    this.cancelFade()
    this._loadSeq++
    this._loading = false

    const oldAudio = this.audio
    if (fade > 0) {
      this._fadingAudio = oldAudio
      const stepMs = 50
      const steps = Math.max(1, Math.round((fade * 1000) / stepMs))
      let step = 0
      this._fadeTimer = setInterval(() => {
        const p = Math.min(1, ++step / steps)
        this.audio.volume = this._volume * p
        oldAudio.volume = this._volume * (1 - p)
        if (p >= 1) this.cancelFade()
      }, stepMs)
    } else {
      oldAudio.pause()
      oldAudio.src = ''
      audioEffects.unregister(oldAudio)
    }

    // Swap to the preloaded audio element
    this.audio = this._preloadAudio
    this._preloadAudio = null
    this._preloadTrack = null
    this._preloadReady = false
    this.audio.volume = fade > 0 ? 0 : this._volume
    this.audio.volume = audioOutput.effectiveVolume(this._volume)

    this.emit('trackchange', track)

    this.audio.play().then(() => {
      jellyfin.reportPlaybackStart(track.id).catch(err => console.warn('[Playback] reportPlaybackStart failed:', err))
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
    } catch (err) {
      console.warn('[Playback] Caching track failed:', track.id, err)
    }
  }

  private wraps() { return this._repeat === 'all' || this.prefs.queueEnd === 'repeat' }

  /** The next track that would play, without mutating any list. */
  private peekNext(): QueueTrack | null {
    if (this._repeat === 'one') return this._current
    if (this._userQueue.length > 0) return this._userQueue[0]
    if (this._orderPos + 1 < this._order.length) {
      return this._context[this._order[this._orderPos + 1]]
    }
    if (this.wraps() && this._order.length > 0) {
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
    } else if (this.wraps() && this._order.length > 0) {
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
    audio.volume = audioOutput.effectiveVolume(this._volume)
    this.attachAudioListeners(audio)
    audioEffects.register(audio)
    this._preloadAudio = audio
    this._preloadTrack = next

    this.resolveSource(next).then(url => {
      if (this._preloadAudio !== audio) return

      audioEffects.setTrackGain(audio, next.item.NormalizationGain)
      audio.src = url
      audio.load()

      audio.addEventListener('canplay', () => {
        if (this._preloadAudio === audio) {
          this._preloadReady = true
        }
      }, { once: true })

      audio.addEventListener('error', () => {
        console.warn('[Playback] Preload failed for:', next.item.Name)
        if (this._preloadAudio === audio) {
          this.invalidatePreload()
        }
      }, { once: true })
    }).catch((err) => {
      console.warn('[Playback] Preload source resolution failed:', next.id, err)
      if (this._preloadAudio === audio) {
        this.invalidatePreload()
      }
    })
  }

  private invalidatePreload() {
    if (this._preloadAudio) {
      this._preloadAudio.src = ''
      audioEffects.unregister(this._preloadAudio)
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
      jellyfin.getLyricsWithCache(id).catch(err => console.warn('[Playback] Lyrics prefetch failed:', id, err))
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
  setQueue(items: JellyfinItem[], startIndex = 0, context: PlaybackContext | string = '', opts: { shuffle?: boolean } = {}) {
    this._context = items.map(item => ({ id: item.Id, item }))
    this._contextInfo = toContext(context)
    this._history = []
    if (opts.shuffle) {
      startIndex = Math.floor(Math.random() * items.length)
      if (!this._shuffle) {
        this._shuffle = true
        this.emit('shufflechange', true)
      }
    }
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

  /** Appends several tracks to the user queue. */
  addItemsToQueue(items: JellyfinItem[]) {
    if (items.length === 0) return
    this._userQueue.push(...items.map(item => ({ id: item.Id, item })))
    this.invalidatePreload()
    this.preloadNext()
    this.emit('queuechange')
  }

  /** Inserts several tracks, in order, at the front of the user queue. */
  addItemsNext(items: JellyfinItem[]) {
    if (items.length === 0) return
    this._userQueue.unshift(...items.map(item => ({ id: item.Id, item })))
    this.invalidatePreload()
    this.preloadNext()
    this.emit('queuechange')
  }

  /** Serializable view of the session, or null when nothing is loaded. */
  getSnapshot(): PlaybackSnapshot | null {
    if (!this._current) return null
    return {
      current: this._current.item,
      items: this._order.map(i => this._context[i].item),
      position: this._orderPos,
      userQueue: this._userQueue.map(t => t.item),
      time: this.audio.currentTime || 0,
      shuffle: this._shuffle,
      repeat: this._repeat,
      context: this._contextInfo,
    }
  }

  /**
   * Loads a saved session paused at its saved position (never autoplays).
   * Ignored when something is already loaded.
   */
  async restoreSnapshot(snap: PlaybackSnapshot): Promise<boolean> {
    if (this._current) return false
    this._context = snap.items.map(item => ({ id: item.Id, item }))
    this._order = this._context.map((_, i) => i)
    this._orderPos = Math.max(-1, Math.min(snap.position, this._order.length - 1))
    this._userQueue = snap.userQueue.map(item => ({ id: item.Id, item }))
    this._history = []
    this._contextInfo = snap.context
    this._shuffle = snap.shuffle
    this._repeat = snap.repeat
    const track: QueueTrack = { id: snap.current.Id, item: snap.current }
    this._current = track
    this._pendingStart = true
    this.emit('shufflechange', this._shuffle)
    this.emit('repeatchange', this._repeat)
    this.emit('queuechange')
    this.emit('trackchange', track)

    try {
      const url = await this.resolveSource(track)
      if (this._current !== track) return false
      const audio = this.audio
      const time = Math.max(0, snap.time)
      audio.addEventListener('loadedmetadata', () => {
        if (this.audio !== audio || this._current !== track) return
        if (time > 0) audio.currentTime = time
        this.emit('timeupdate', { currentTime: time, duration: audio.duration || 0 })
      }, { once: true })
      audioEffects.setTrackGain(audio, track.item.NormalizationGain)
      audio.src = url
      audio.load()
      this.emit('timeupdate', {
        currentTime: time,
        duration: track.item.RunTimeTicks ? ticksToSeconds(track.item.RunTimeTicks) : 0,
      })
      return true
    } catch (err) {
      console.warn('[Playback] Session restore failed:', err)
      return false
    }
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
    this.cancelFade()
    this.audio.pause()
    this.audio.src = ''
    this.invalidatePreload()
    this._context = []
    this._order = []
    this._orderPos = -1
    this._contextInfo = null
    this._pendingStart = false
    this._userQueue = []
    this._history = []
    this._current = null
    this.emit('trackchange', null)
    this.emit('queuechange')
  }

  async play() {
    if (!this.audio.src) return
    audioEffects.resume()
    await this.audio.play()
    const track = this._current
    if (this._pendingStart && track) {
      this._pendingStart = false
      jellyfin.reportPlaybackStart(track.id).catch(err => console.warn('[Playback] reportPlaybackStart failed:', err))
      this.startScrobbleTracking(track)
      this.preloadNext()
    }
  }

  pause() {
    this.cancelFade()
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
    this.audio.volume = audioOutput.effectiveVolume(this._volume)
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
      const ticks = secondsToTicks(this.duration)
      jellyfin.reportPlaybackStopped(ended.id, ticks).catch(err => console.warn('[Playback] reportPlaybackStopped failed:', err))
    }

    const next = this.advance()
    if (!next) {
      this.emit('queueend')
      if (ended && this.prefs.queueEnd === 'radio') this.continueWithRadio(ended)
      return
    }
    this.emit('queuechange')
    this.transitionTo(next)
  }

  /** Plays `next` (already current): gapless swap when allowed and ready, else a full load. */
  private transitionTo(next: QueueTrack) {
    if (this.prefs.gapless && this._preloadReady && this._preloadTrack && this._preloadTrack.id === next.id) {
      this.playPreloaded()
    } else {
      this.loadAndPlayCurrent()
    }
  }

  /** Queue ran out: keep going with an instant mix seeded by the last track. */
  private async continueWithRadio(track: QueueTrack) {
    try {
      const res = await jellyfin.getInstantMix(track.id)
      const rest = res.Items.filter(i => i.Id !== track.id)
      if (rest.length === 0 || this._current !== track) return
      const name = t('prefs.playback.radioContext', { name: track.item.Name || t('playback.trackFallback') })
      this.setQueue(rest, 0, { type: 'radio', id: track.id, name })
    } catch (err) {
      console.warn('[Playback] Radio continuation failed:', err)
    }
  }

  private startScrobbleTracking(track: QueueTrack) {
    this.scrobbleItem = track.item
    this.scrobbleStartedAt = Math.floor(Date.now() / 1000)
    this.scrobbleDone = false
    lastfm.nowPlaying(track.item).catch(err => console.warn('[Playback] Last.fm now-playing failed:', err))
  }

  private finalizeScrobble() {
    const item = this.scrobbleItem
    if (!item || this.scrobbleDone) return
    const played = this.audio.currentTime
    const duration = item.RunTimeTicks ? ticksToSeconds(item.RunTimeTicks) : this.audio.duration
    if (lastfm.shouldScrobble(played, duration)) {
      this.scrobbleDone = true
      lastfm.scrobble(item, this.scrobbleStartedAt).catch(err => console.warn('[Playback] Last.fm scrobble failed:', err))
    }
  }

  next() {
    const next = this.advance()
    if (!next) return
    this.emit('queuechange')
    this.transitionTo(next)
  }

  previous() {
    const threshold = this.prefs.previousThreshold
    if (threshold > 0 && this.audio.currentTime > threshold) {
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
