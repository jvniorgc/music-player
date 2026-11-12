import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { JellyfinItem } from './jellyfin'

// Mock the Jellyfin singleton so the playback engine has no real network/auth deps.
// Use plain functions (not vi.fn) so the shared afterEach restoreAllMocks() does
// not strip their return values between tests.
vi.mock('./jellyfin', () => ({
  jellyfin: {
    getStreamUrl: (id: string) => `stream://${id}`,
    reportPlaybackStart: () => Promise.resolve(),
    reportPlaybackStopped: () => Promise.resolve(),
    getLyricsWithCache: () => Promise.resolve([]),
    getImageUrl: (id: string) => `img://${id}`,
    getInstantMix: (id: string) => Promise.resolve({ Items: [{ Id: id, Name: id, Type: 'Audio' }, { Id: 'mix1', Name: 'Mix 1', Type: 'Audio' }] }),
    serverUrl: 'http://jf',
    userId: 'u',
    token: 't',
  },
}))

// Mock the Last.fm service so scrobble side-effects are observable. Fresh vi.fns
// are produced each test because beforeEach() resetModules() re-runs this factory.
vi.mock('./lastfm', () => ({
  nowPlaying: vi.fn(() => Promise.resolve()),
  scrobble: vi.fn(() => Promise.resolve()),
  shouldScrobble: vi.fn((played: number, duration: number) =>
    duration >= 30 && (played >= 240 || played >= duration / 2)),
}))

// Lets individual tests force load/play failures to exercise error paths.
const audioConfig = { failLoad: false, failPlay: false }

// Minimal HTMLAudioElement stand-in. jsdom does not implement media playback,
// so we model just enough event behavior for the engine's load/play flow.
class FakeAudio {
  src = ''
  preload = ''
  volume = 1
  currentTime = 0
  duration = 100
  paused = true
  error: { code?: number; message?: string } | null = null
  private listeners: Record<string, Array<() => void>> = {}
  addEventListener(type: string, cb: () => void) {
    ;(this.listeners[type] ||= []).push(cb)
  }
  removeEventListener(type: string, cb: () => void) {
    this.listeners[type] = (this.listeners[type] || []).filter(f => f !== cb)
  }
  dispatch(type: string) {
    ;(this.listeners[type] || []).slice().forEach(f => f())
  }
  load() {
    if (audioConfig.failLoad) {
      this.error = { code: 4, message: 'load failed' }
      queueMicrotask(() => this.dispatch('error'))
    } else {
      queueMicrotask(() => this.dispatch('canplay'))
    }
  }
  play() {
    if (audioConfig.failPlay) {
      this.paused = true
      return Promise.reject(new Error('play failed'))
    }
    this.paused = false
    queueMicrotask(() => this.dispatch('playing'))
    return Promise.resolve()
  }
  pause() {
    this.paused = true
    this.dispatch('pause')
  }
}

function makeItems(n: number): JellyfinItem[] {
  return Array.from({ length: n }, (_, i) => ({ Id: `t${i}`, Name: `Track ${i}`, Type: 'Audio' }))
}

const item = (id: string): JellyfinItem => ({ Id: id, Name: id.toUpperCase(), Type: 'Audio' })

let playback: (typeof import('./playback'))['playback']

async function loadEngine() {
  vi.resetModules()
  vi.stubGlobal('Audio', FakeAudio as unknown as typeof Audio)
  playback = (await import('./playback')).playback
}

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  localStorage.clear()
  audioConfig.failLoad = false
  audioConfig.failPlay = false
  await loadEngine()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// Let queued microtasks (canplay/play) settle.
const flush = () => new Promise(r => setTimeout(r, 0))
const ids = (tracks: { id: string }[]) => tracks.map(t => t.id)

describe('queue setup', () => {
  it('setQueue loads the context and starts at the requested index', async () => {
    const events: string[] = []
    playback.on(e => events.push(e))
    playback.setQueue(makeItems(3), 1, 'My Album')
    expect(playback.currentTrack?.id).toBe('t1')
    expect(playback.contextName).toBe('My Album')
    expect(ids(playback.contextUpNext)).toEqual(['t2'])
    expect(events).toContain('trackchange')
    expect(events).toContain('queuechange')
    await flush()
  })

  it('clamps an out-of-range start index to the last track', () => {
    playback.setQueue(makeItems(3), 99)
    expect(playback.currentTrack?.id).toBe('t2')
    expect(playback.contextUpNext).toHaveLength(0)
  })
})

describe('linear navigation (repeat: none)', () => {
  beforeEach(() => playback.setQueue(makeItems(3), 0))

  it('next advances through the context and stops at the end', () => {
    playback.next()
    expect(playback.currentTrack?.id).toBe('t1')
    playback.next()
    expect(playback.currentTrack?.id).toBe('t2')
    playback.next() // no next track -> stays put
    expect(playback.currentTrack?.id).toBe('t2')
  })

  it('previous walks back through history and stops at the start', () => {
    playback.next()
    playback.next()
    playback.previous()
    expect(playback.currentTrack?.id).toBe('t1')
    playback.previous()
    expect(playback.currentTrack?.id).toBe('t0')
    playback.previous() // history empty -> restart current
    expect(playback.currentTrack?.id).toBe('t0')
  })

  it('previous restarts the track when more than 3s have elapsed', () => {
    playback.next()
    ;(playback as unknown as { audio: FakeAudio }).audio.currentTime = 5
    playback.previous()
    expect(playback.currentTrack?.id).toBe('t1')
    expect(playback.currentTime).toBe(0)
  })

  it('previous re-queues the abandoned track so next returns to it', () => {
    playback.next() // t1
    playback.previous() // back to t0, t1 pushed to front of user queue
    expect(playback.currentTrack?.id).toBe('t0')
    expect(ids(playback.userQueue)).toEqual(['t1'])
    playback.next()
    expect(playback.currentTrack?.id).toBe('t1')
  })
})

describe('repeat modes', () => {
  beforeEach(() => playback.setQueue(makeItems(3), 0))

  it('toggleRepeat cycles none -> all -> one -> none', () => {
    expect(playback.repeat).toBe('none')
    playback.toggleRepeat()
    expect(playback.repeat).toBe('all')
    playback.toggleRepeat()
    expect(playback.repeat).toBe('one')
    playback.toggleRepeat()
    expect(playback.repeat).toBe('none')
  })

  it('repeat all wraps from the last track back to the first', () => {
    playback.toggleRepeat() // all
    playback.next()
    playback.next()
    expect(playback.currentTrack?.id).toBe('t2')
    playback.next()
    expect(playback.currentTrack?.id).toBe('t0')
  })

  it('repeat one keeps the same track on next', () => {
    playback.toggleRepeat()
    playback.toggleRepeat() // one
    playback.next()
    expect(playback.currentTrack?.id).toBe('t0')
  })
})

describe('user queue (Spotify-style)', () => {
  beforeEach(() => playback.setQueue(makeItems(3), 0))

  it('addToQueue appends to the end of the user queue', () => {
    const events: string[] = []
    playback.on(e => events.push(e))
    playback.addToQueue(item('a'))
    playback.addToQueue(item('b'))
    expect(ids(playback.userQueue)).toEqual(['a', 'b'])
    expect(events).toContain('queuechange')
  })

  it('addNext inserts at the front of the user queue', () => {
    playback.addToQueue(item('a'))
    playback.addNext(item('b'))
    expect(ids(playback.userQueue)).toEqual(['b', 'a'])
  })

  it('plays the user queue before resuming the context, consuming each item', () => {
    playback.addToQueue(item('a'))
    playback.addToQueue(item('b'))
    // Still on t0, context up-next is the rest of the album.
    expect(ids(playback.contextUpNext)).toEqual(['t1', 't2'])

    playback.next() // -> a (consumed)
    expect(playback.currentTrack?.id).toBe('a')
    expect(ids(playback.userQueue)).toEqual(['b'])

    playback.next() // -> b (consumed)
    expect(playback.currentTrack?.id).toBe('b')
    expect(playback.userQueue).toHaveLength(0)

    playback.next() // -> resumes context at t1
    expect(playback.currentTrack?.id).toBe('t1')
  })

  it('removeFromUserQueue removes the right entry and ignores bad indices', () => {
    playback.addToQueue(item('a'))
    playback.addToQueue(item('b'))
    playback.removeFromUserQueue(5) // out of range -> no-op
    expect(playback.userQueue).toHaveLength(2)
    playback.removeFromUserQueue(0)
    expect(ids(playback.userQueue)).toEqual(['b'])
  })

  it('playUserQueueAt jumps to a queued track and consumes the ones above it', () => {
    playback.addToQueue(item('a'))
    playback.addToQueue(item('b'))
    playback.addToQueue(item('c'))
    playback.playUserQueueAt(1) // -> b, drops a and b from the queue
    expect(playback.currentTrack?.id).toBe('b')
    expect(ids(playback.userQueue)).toEqual(['c'])
  })

  it('playUserQueueAt ignores out-of-range indices', () => {
    playback.addToQueue(item('a'))
    playback.playUserQueueAt(9)
    expect(playback.currentTrack?.id).toBe('t0')
  })
})

describe('context up-next manipulation', () => {
  beforeEach(() => playback.setQueue(makeItems(4), 0))

  it('removeFromContext drops a future context track', () => {
    expect(ids(playback.contextUpNext)).toEqual(['t1', 't2', 't3'])
    playback.removeFromContext(1) // remove t2
    expect(ids(playback.contextUpNext)).toEqual(['t1', 't3'])
  })

  it('removeFromContext ignores out-of-range indices', () => {
    playback.removeFromContext(50)
    expect(playback.contextUpNext).toHaveLength(3)
  })

  it('playContextAt jumps ahead within the context', () => {
    playback.playContextAt(1) // -> t2
    expect(playback.currentTrack?.id).toBe('t2')
    expect(ids(playback.contextUpNext)).toEqual(['t3'])
  })

  it('playContextAt ignores out-of-range indices', () => {
    playback.playContextAt(50)
    expect(playback.currentTrack?.id).toBe('t0')
  })
})

describe('clearQueue', () => {
  it('empties both lists and emits a null trackchange', () => {
    playback.setQueue(makeItems(3), 0)
    playback.addToQueue(item('a'))
    const seen: Array<[string, unknown]> = []
    playback.on((e, d) => seen.push([e, d]))
    playback.clearQueue()
    expect(playback.currentTrack).toBeNull()
    expect(playback.userQueue).toEqual([])
    expect(playback.contextUpNext).toEqual([])
    expect(playback.contextName).toBe('')
    expect(seen).toContainEqual(['trackchange', null])
  })
})

describe('shuffle (context only)', () => {
  it('keeps the current track playing and emits shufflechange', () => {
    playback.setQueue(makeItems(5), 2)
    const events: string[] = []
    playback.on(e => events.push(e))
    vi.spyOn(Math, 'random').mockReturnValue(0)
    playback.toggleShuffle()
    expect(playback.shuffle).toBe(true)
    expect(events).toContain('shufflechange')
    expect(playback.currentTrack?.id).toBe('t2')
  })

  it('does not reorder the manually-added user queue', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    playback.setQueue(makeItems(4), 0)
    playback.addToQueue(item('a'))
    playback.addToQueue(item('b'))
    playback.toggleShuffle()
    expect(ids(playback.userQueue)).toEqual(['a', 'b'])
  })

  it('toggling shuffle off restores the in-order context after the current track', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    playback.setQueue(makeItems(4), 1)
    playback.toggleShuffle()
    playback.toggleShuffle() // back off
    expect(playback.currentTrack?.id).toBe('t1')
    expect(ids(playback.contextUpNext)).toEqual(['t2', 't3'])
  })

  it('anchors the start track without swapping when it is already first', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    // With random()=0 the Fisher-Yates pass leaves index 1 at order[0],
    // so starting at index 1 needs no extra anchor swap.
    playback.setQueue(makeItems(3), 1)
    playback.toggleShuffle()
    expect(playback.currentTrack?.id).toBe('t1')
  })

  it('advances through the shuffled context and wraps with repeat all', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    playback.setQueue(makeItems(3), 0)
    playback.toggleShuffle()
    playback.toggleRepeat() // all
    const order = playback.contextUpNext.map(t => t.id)
    playback.next()
    playback.next() // last shuffle position
    playback.next() // wraps back to the anchor
    expect(playback.currentTrack?.id).toBe('t0')
    expect(order.length).toBe(2)
  })

  it('stops at the shuffle boundary when repeat is off', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    playback.setQueue(makeItems(2), 0)
    playback.toggleShuffle()
    playback.next() // to the last shuffle position
    const last = playback.currentTrack?.id
    playback.next() // should not advance past the end
    expect(playback.currentTrack?.id).toBe(last)
  })
})

describe('seek & volume', () => {
  beforeEach(() => playback.setQueue(makeItems(2), 0))

  it('seek sets currentTime for finite values and ignores Infinity', () => {
    playback.seek(42)
    expect(playback.currentTime).toBe(42)
    playback.seek(Infinity)
    expect(playback.currentTime).toBe(42)
  })

  it('setVolume clamps to [0,1], persists, and emits volumechange', () => {
    const events: Array<[string, unknown]> = []
    playback.on((e, d) => events.push([e, d]))
    playback.setVolume(2)
    expect(playback.volume).toBe(1)
    playback.setVolume(-1)
    expect(playback.volume).toBe(0)
    playback.setVolume(0.5)
    expect(playback.volume).toBe(0.5)
    expect(localStorage.getItem('player_volume')).toBe('0.5')
    expect(events).toContainEqual(['volumechange', 0.5])
  })

  it('caps the element volume at the max volume preference', async () => {
    const { useAudioPrefs } = await import('../stores/prefs/audio')
    useAudioPrefs.getState().set({ maxVolume: 50 })
    playback.setVolume(0.8)
    expect(playback.volume).toBe(0.8)
    expect((playback as any).audio.volume).toBeCloseTo(0.4)
    useAudioPrefs.getState().reset()
  })
})

describe('volume persistence', () => {
  it('restores a previously saved volume on construction', async () => {
    localStorage.setItem('player_volume', '0.25')
    await loadEngine()
    expect(playback.volume).toBe(0.25)
  })
})

describe('source resolution', () => {
  it('prefers a downloaded file when one exists', async () => {
    vi.mocked(window.api.getDownloadPath).mockResolvedValue('/downloads/t0.audio')
    playback.setQueue(makeItems(1), 0)
    await flush()
    expect(playback.currentTrack?.source).toBe('download')
    expect(playback.currentTrack?.localPath).toBe('/downloads/t0.audio')
  })

  it('falls back to the cache when there is no download', async () => {
    vi.mocked(window.api.getDownloadPath).mockResolvedValue(null)
    vi.mocked(window.api.getCachedAudio).mockResolvedValue('/cache/t0.audio')
    playback.setQueue(makeItems(1), 0)
    await flush()
    expect(playback.currentTrack?.source).toBe('cache')
  })

  it('streams from the server when nothing is local', async () => {
    vi.mocked(window.api.getDownloadPath).mockResolvedValue(null)
    vi.mocked(window.api.getCachedAudio).mockResolvedValue(null)
    playback.setQueue(makeItems(1), 0)
    await flush()
    expect(playback.currentTrack?.source).toBe('stream')
  })

  it('falls back to streaming when the download and cache lookups reject', async () => {
    vi.mocked(window.api.getDownloadPath).mockRejectedValue(new Error('disk error'))
    vi.mocked(window.api.getCachedAudio).mockRejectedValue(new Error('cache error'))
    playback.setQueue(makeItems(1), 0)
    await flush()
    expect(playback.currentTrack?.source).toBe('stream')
  })
})

describe('track ended handling', () => {
  it('advances to the next track when the current one ends', async () => {
    playback.setQueue(makeItems(3), 0)
    await flush()
    ;(playback as any).audio.dispatch('ended')
    await flush()
    expect(playback.currentTrack?.id).toBe('t1')
  })

  it('consumes the user queue first when a track ends', async () => {
    playback.setQueue(makeItems(2), 0)
    playback.addToQueue(item('a'))
    await flush()
    ;(playback as any).audio.dispatch('ended')
    await flush()
    expect(playback.currentTrack?.id).toBe('a')
    expect(playback.userQueue).toHaveLength(0)
  })

  it('emits queueend when the final track ends with repeat off', async () => {
    playback.setQueue(makeItems(2), 1)
    await flush()
    const events: string[] = []
    playback.on(e => events.push(e))
    ;(playback as any).audio.dispatch('ended')
    await flush()
    expect(events).toContain('queueend')
    expect(playback.currentTrack?.id).toBe('t1')
  })
})

describe('play/pause control', () => {
  it('togglePlay pauses when playing and resumes when paused', async () => {
    playback.setQueue(makeItems(1), 0)
    await flush()
    expect(playback.isPlaying).toBe(true)
    await playback.togglePlay()
    expect(playback.isPlaying).toBe(false)
    await playback.togglePlay()
    expect(playback.isPlaying).toBe(true)
  })

  it('play does nothing when no source is loaded', async () => {
    await playback.play()
    expect(playback.isPlaying).toBe(false)
  })
})

describe('audio element events', () => {
  it('re-emits timeupdate, buffering (waiting) and error events to listeners', async () => {
    playback.setQueue(makeItems(1), 0)
    await flush()
    const seen: Array<[string, unknown]> = []
    playback.on((e, d) => seen.push([e, d]))
    const audio = (playback as any).audio as FakeAudio
    audio.currentTime = 12
    audio.duration = 200
    audio.dispatch('timeupdate')
    audio.dispatch('waiting')
    audio.error = { code: 3, message: 'decode error' }
    audio.dispatch('error')
    expect(seen).toContainEqual(['timeupdate', { currentTime: 12, duration: 200 }])
    expect(seen).toContainEqual(['buffering', true])
    expect(seen.some(([e, d]) => e === 'error' && /Couldn't play/.test(String(d)))).toBe(true)
  })

  it('skips to the next track when the current one fails mid-playback', async () => {
    playback.setQueue(makeItems(3), 0)
    await flush()
    const seen: Array<[string, unknown]> = []
    playback.on((e, d) => seen.push([e, d]))
    const audio = (playback as any).audio as FakeAudio
    audio.error = null
    audio.dispatch('error')
    await flush()
    expect(seen.some(([e]) => e === 'error')).toBe(true)
    expect(playback.currentTrack?.id).toBe('t1')
  })

  it('waits for the network instead of skipping when a stream fails offline', async () => {
    playback.setQueue(makeItems(3), 0)
    await flush()
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      const seen: Array<[string, unknown]> = []
      playback.on((e, d) => seen.push([e, d]))
      ;(playback as any).audio.dispatch('error')
      await flush()
      expect(playback.currentTrack?.id).toBe('t0')
      expect(seen.some(([e, d]) => e === 'error' && /Connection lost/.test(String(d)))).toBe(true)
      expect((playback as any)._resumeOnOnline?.trackId).toBe('t0')
    } finally {
      online.mockRestore()
    }
  })

  it('resumes the interrupted track at its position once the network returns', async () => {
    playback.setQueue(makeItems(3), 0)
    await flush()
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const audio = (playback as any).audio as FakeAudio
    audio.currentTime = 42
    audio.dispatch('error')
    await flush()
    online.mockRestore()
    const load = vi.spyOn(playback as any, 'loadAndPlayCurrent')

    window.dispatchEvent(new Event('online'))
    expect(load).toHaveBeenCalledWith(42)
    expect((playback as any)._resumeOnOnline).toBeNull()

    // A second 'online' with nothing pending is a no-op.
    load.mockClear()
    window.dispatchEvent(new Event('online'))
    expect(load).not.toHaveBeenCalled()
  })

  it('keeps playing when caching the streamed track fails', async () => {
    vi.mocked(window.api.cacheAudio).mockRejectedValue(new Error('disk full'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    playback.setQueue(makeItems(2), 0)
    await flush()
    expect(window.api.cacheAudio).toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('[Playback] Caching track failed:', 't0', expect.any(Error))
    expect(playback.currentTrack?.id).toBe('t0')
  })

  it('stops skipping after repeated consecutive failures', async () => {
    audioConfig.failPlay = true
    playback.setQueue(makeItems(6), 0)
    for (let i = 0; i < 10; i++) await flush()
    // t0, t1 fail and are skipped; the third failure (t2) stops the chain.
    expect(playback.currentTrack?.id).toBe('t2')
  })

  it('ignores events from a stale (non-current) audio element', async () => {
    playback.setQueue(makeItems(1), 0)
    await flush()
    const stale = (playback as any).audio as FakeAudio
    ;(playback as any).audio = new FakeAudio()
    const seen: string[] = []
    playback.on(e => seen.push(e))
    stale.dispatch('timeupdate')
    stale.dispatch('playing')
    stale.dispatch('pause')
    stale.dispatch('waiting')
    stale.dispatch('canplay')
    stale.dispatch('error')
    stale.dispatch('ended')
    expect(seen).not.toContain('timeupdate')
    expect(seen).not.toContain('playing')
  })
})

describe('playback error & fallback', () => {
  it('retries via the universal endpoint when the direct stream fails to load', async () => {
    audioConfig.failLoad = true // first load() errors -> rejects the canplay wait
    playback.setQueue(makeItems(1), 0)
    await flush()
    await flush()
    expect((playback as any).audio.src).toContain('/universal?')
    expect(playback.currentTrack?.id).toBe('t0')
  })

  it('emits error when both the direct stream and the universal fallback fail', async () => {
    audioConfig.failLoad = true
    audioConfig.failPlay = true
    const seen: Array<[string, unknown]> = []
    playback.setQueue(makeItems(1), 0)
    playback.on((e, d) => seen.push([e, d]))
    await flush()
    await flush()
    expect(seen.some(([e]) => e === 'error')).toBe(true)
  })

  it('does not retry the universal endpoint for a non-stream source', async () => {
    vi.mocked(window.api.getDownloadPath).mockResolvedValue('/downloads/t0.audio')
    audioConfig.failLoad = true
    const seen: Array<[string, unknown]> = []
    playback.setQueue(makeItems(1), 0)
    playback.on((e, d) => seen.push([e, d]))
    await flush()
    await flush()
    expect((playback as any).audio.src).not.toContain('/universal?')
    expect(seen.some(([e]) => e === 'error')).toBe(true)
  })
})

describe('gapless preloading', () => {
  it('preloads the next track once the current one starts', async () => {
    playback.setQueue(makeItems(3), 0)
    await flush()
    expect((playback as any)._preloadAudio).not.toBeNull()
    expect((playback as any)._preloadTrack.id).toBe('t1')
    expect((playback as any)._preloadReady).toBe(true)
  })

  it('uses the preloaded element for a gapless transition on ended', async () => {
    playback.setQueue(makeItems(3), 0)
    await flush()
    expect((playback as any)._preloadReady).toBe(true)
    ;(playback as any).audio.dispatch('ended')
    await flush()
    expect(playback.currentTrack?.id).toBe('t1')
  })

  it('invalidates the preload when the preloaded element errors', async () => {
    playback.setQueue(makeItems(3), 0)
    await flush()
    ;(playback as any)._preloadAudio.dispatch('error')
    expect((playback as any)._preloadAudio).toBeNull()
    expect((playback as any)._preloadReady).toBe(false)
  })

  it('invalidates the preload when resolving the next source rejects', async () => {
    playback.setQueue(makeItems(3), 0)
    await flush()
    const jf = (await import('./jellyfin')).jellyfin
    const original = jf.getStreamUrl
    ;(jf as any).getStreamUrl = () => { throw new Error('no url') }
    vi.mocked(window.api.getDownloadPath).mockResolvedValue(null)
    vi.mocked(window.api.getCachedAudio).mockResolvedValue(null)
    ;(playback as any).invalidatePreload()
    ;(playback as any).preloadNext()
    await flush()
    expect((playback as any)._preloadAudio).toBeNull()
    ;(jf as any).getStreamUrl = original
  })

  it('plays the next track directly when nothing is preloaded', async () => {
    playback.setQueue(makeItems(3), 0)
    await flush()
    ;(playback as any).invalidatePreload()
    ;(playback as any).audio.dispatch('ended')
    await flush()
    expect(playback.currentTrack?.id).toBe('t1')
  })

  it('falls back to a full load when a gapless transition fails to play', async () => {
    playback.setQueue(makeItems(3), 0)
    await flush()
    expect((playback as any)._preloadReady).toBe(true)
    audioConfig.failPlay = true
    ;(playback as any).audio.dispatch('ended')
    await flush()
    await flush()
    // The full reload of t1 also fails, so it is reported and skipped.
    expect(playback.currentTrack?.id).toBe('t2')
  })

  it('preloads the wrap-around track at the context end with repeat all', async () => {
    playback.setQueue(makeItems(2), 0)
    playback.toggleRepeat() // all
    playback.next() // -> t1, the last context track
    await flush()
    expect((playback as any)._preloadTrack?.id).toBe('t0')
  })

  it('playPreloaded is a no-op when no preload is ready', async () => {
    playback.setQueue(makeItems(3), 0)
    await flush()
    ;(playback as any).invalidatePreload()
    expect((playback as any).playPreloaded()).toBe(false)
  })
})

describe('last.fm scrobbling', () => {
  const lastfm = () => import('./lastfm')

  it('reports now playing when a track starts', async () => {
    playback.setQueue(makeItems(1), 0)
    await flush()
    const lf = await lastfm()
    expect(lf.nowPlaying).toHaveBeenCalledWith(expect.objectContaining({ Id: 't0' }))
  })

  it('scrobbles a track that ends after enough play', async () => {
    playback.setQueue(makeItems(2), 0)
    await flush()
    const audio = (playback as any).audio as FakeAudio
    audio.currentTime = 100 // full play of the 100s fake track
    audio.dispatch('ended')
    await flush()
    const lf = await lastfm()
    expect(lf.scrobble).toHaveBeenCalledWith(expect.objectContaining({ Id: 't0' }), expect.any(Number))
  })

  it('does not scrobble a track skipped too early', async () => {
    playback.setQueue(makeItems(2), 0)
    await flush()
    const audio = (playback as any).audio as FakeAudio
    audio.currentTime = 5 // only 5% of a 100s track
    audio.dispatch('ended')
    await flush()
    const lf = await lastfm()
    expect(lf.scrobble).not.toHaveBeenCalled()
  })

  it('scrobbles the outgoing track on a manual skip past the threshold', async () => {
    playback.setQueue(makeItems(3), 0)
    await flush()
    ;(playback as any).audio.currentTime = 60
    playback.next()
    await flush()
    const lf = await lastfm()
    expect(lf.scrobble).toHaveBeenCalledWith(expect.objectContaining({ Id: 't0' }), expect.any(Number))
  })

  it('uses the item runtime as the scrobble duration when available', async () => {
    const items = makeItems(2).map(i => ({ ...i, RunTimeTicks: 300 * 10_000_000 }))
    playback.setQueue(items, 0)
    await flush()
    const audio = (playback as any).audio as FakeAudio
    audio.currentTime = 160
    audio.dispatch('ended')
    await flush()
    const lf = await lastfm()
    expect(lf.shouldScrobble).toHaveBeenCalledWith(160, 300)
    expect(lf.scrobble).toHaveBeenCalledWith(expect.objectContaining({ Id: 't0' }), expect.any(Number))
  })
})

describe('playback context', () => {
  it('stores a structured context and wraps plain names as custom', () => {
    playback.setQueue(makeItems(2), 0, { type: 'album', id: 'a1', name: 'Album' })
    expect(playback.context).toEqual({ type: 'album', id: 'a1', name: 'Album' })
    expect(playback.contextName).toBe('Album')
    playback.setQueue(makeItems(2), 0, 'Mix')
    expect(playback.context).toEqual({ type: 'custom', name: 'Mix' })
    playback.setQueue(makeItems(2), 0)
    expect(playback.context).toBeNull()
  })

  it('shuffle option turns shuffle on and starts from a random track', () => {
    const events: [string, unknown][] = []
    playback.on((e, d) => events.push([e, d]))
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    playback.setQueue(makeItems(4), 0, 'X', { shuffle: true })
    expect(playback.shuffle).toBe(true)
    expect(events).toContainEqual(['shufflechange', true])
    expect(playback.currentTrack?.id).toBe('t3')
    expect(playback.contextUpNext).toHaveLength(3)
    // Already shuffled: no second shufflechange.
    events.length = 0
    playback.setQueue(makeItems(2), 0, 'Y', { shuffle: true })
    expect(events.some(([e]) => e === 'shufflechange')).toBe(false)
  })

  it('addItemsToQueue/addItemsNext queue several tracks in order', () => {
    playback.setQueue(makeItems(1), 0)
    playback.addItemsToQueue([])
    playback.addItemsNext([])
    expect(playback.userQueue).toHaveLength(0)
    playback.addItemsToQueue([item('a'), item('b')])
    playback.addItemsNext([item('c'), item('d')])
    expect(ids(playback.userQueue)).toEqual(['c', 'd', 'a', 'b'])
  })
})

describe('session snapshot', () => {
  it('returns null when nothing is loaded', () => {
    expect(playback.getSnapshot()).toBeNull()
  })

  it('captures context order, cursor, user queue and modes', async () => {
    playback.setQueue(makeItems(3), 1, { type: 'playlist', id: 'p', name: 'P' })
    playback.addToQueue(item('q'))
    playback.toggleRepeat()
    await flush()
    const snap = playback.getSnapshot()!
    expect(snap.current.Id).toBe('t1')
    expect(snap.items.map(i => i.Id)).toEqual(['t0', 't1', 't2'])
    expect(snap.position).toBe(1)
    expect(snap.userQueue.map(i => i.Id)).toEqual(['q'])
    expect(snap.repeat).toBe('all')
    expect(snap.context).toEqual({ type: 'playlist', id: 'p', name: 'P' })
  })

  it('restores paused at the saved position and starts reporting on first play', async () => {
    const { jellyfin } = await import('./jellyfin')
    const report = vi.spyOn(jellyfin, 'reportPlaybackStart')
    const events: [string, any][] = []
    playback.on((e, d) => events.push([e, d]))
    const ok = await playback.restoreSnapshot({
      current: { ...item('t1'), RunTimeTicks: 600_000_000 },
      items: makeItems(3), position: 1, userQueue: [item('q')],
      time: 42, shuffle: true, repeat: 'one', context: { type: 'album', id: 'a', name: 'A' },
    })
    expect(ok).toBe(true)
    expect(playback.currentTrack?.id).toBe('t1')
    expect(playback.isPlaying).toBe(false)
    expect(playback.shuffle).toBe(true)
    expect(playback.repeat).toBe('one')
    expect(ids(playback.contextUpNext)).toEqual(['t2'])
    expect(ids(playback.userQueue)).toEqual(['q'])
    expect(events).toContainEqual(['timeupdate', { currentTime: 42, duration: 60 }])
    const audio = (playback as any).audio
    audio.dispatch('loadedmetadata')
    expect(audio.currentTime).toBe(42)
    expect(report).not.toHaveBeenCalled()

    await playback.play()
    expect(report).toHaveBeenCalledWith('t1')
    report.mockClear()
    playback.pause()
    await playback.play()
    expect(report).not.toHaveBeenCalled()
  })

  it('does not replace an active session and survives source failures', async () => {
    const snap = { current: item('x'), items: [], position: -1, userQueue: [], time: 0, shuffle: false, repeat: 'none' as const, context: null }
    playback.setQueue(makeItems(1), 0)
    expect(await playback.restoreSnapshot(snap)).toBe(false)

    await loadEngine()
    vi.mocked(window.api.getDownloadPath).mockResolvedValue(null)
    const { jellyfin } = await import('./jellyfin')
    vi.spyOn(jellyfin, 'getStreamUrl').mockImplementation(() => { throw new Error('no url') })
    expect(await playback.restoreSnapshot(snap)).toBe(false)
    expect(playback.currentTrack?.id).toBe('x')
  })

  it('ignores a restore superseded by a new queue', async () => {
    const snap = { current: item('x'), items: [], position: -1, userQueue: [], time: 5, shuffle: false, repeat: 'none' as const, context: null }
    const pending = playback.restoreSnapshot(snap)
    playback.clearQueue()
    expect(await pending).toBe(false)
  })

  it('ignores loadedmetadata after the track changed', async () => {
    const snap = { current: item('x'), items: [], position: -1, userQueue: [], time: 5, shuffle: false, repeat: 'none' as const, context: null }
    await playback.restoreSnapshot(snap)
    const audio = (playback as any).audio
    audio.currentTime = 0
    playback.clearQueue()
    audio.dispatch('loadedmetadata')
    expect(audio.currentTime).toBe(0)
  })
})

describe('audio effects integration', () => {
  const effects = async () => (await import('./audioEffects')).audioEffects

  it('registers the main and preloaded elements and applies each track normalization gain', async () => {
    const fx = await effects()
    const setTrackGain = vi.spyOn(fx, 'setTrackGain')
    const items = makeItems(3).map((it, i) => ({ ...it, NormalizationGain: -i - 1 }))
    playback.setQueue(items, 0)
    await flush()
    const main = (playback as any).audio
    expect(main.crossOrigin).toBe('anonymous')
    expect(setTrackGain).toHaveBeenCalledWith(main, -1)
    const pre = (playback as any)._preloadAudio
    expect(pre.crossOrigin).toBe('anonymous')
    expect(setTrackGain).toHaveBeenCalledWith(pre, -2)
  })

  it('unregisters discarded elements and resumes the context on play', async () => {
    const fx = await effects()
    const unregister = vi.spyOn(fx, 'unregister')
    const resume = vi.spyOn(fx, 'resume')
    playback.setQueue(makeItems(3), 0)
    await flush()
    const first = (playback as any).audio
    ;(playback as any).audio.dispatch('ended') // gapless swap discards the old element
    await flush()
    expect(unregister).toHaveBeenCalledWith(first)
    const pre = (playback as any)._preloadAudio
    ;(playback as any).invalidatePreload()
    expect(unregister).toHaveBeenCalledWith(pre)
    await playback.play()
    expect(resume).toHaveBeenCalled()
  })
})

async function setPrefs(patch: Record<string, unknown>) {
  const { usePlaybackPrefs } = await import('../stores/prefs/playback')
  usePlaybackPrefs.getState().set(patch)
}

describe('playback preferences', () => {
  it('previous threshold: restarts only past the configured seconds', async () => {
    await setPrefs({ previousThreshold: 10 })
    playback.setQueue(makeItems(3), 0)
    playback.next()
    ;(playback as any).audio.currentTime = 5
    playback.previous()
    expect(playback.currentTrack?.id).toBe('t0')
  })

  it('previous threshold 0 always goes back', async () => {
    await setPrefs({ previousThreshold: 0 })
    playback.setQueue(makeItems(3), 0)
    playback.next()
    ;(playback as any).audio.currentTime = 50
    playback.previous()
    expect(playback.currentTrack?.id).toBe('t0')
  })

  it('gapless off does a full load instead of swapping the preloaded element', async () => {
    await setPrefs({ gapless: false })
    playback.setQueue(makeItems(3), 0)
    await flush()
    const preloaded = (playback as any)._preloadAudio
    ;(playback as any).audio.dispatch('ended')
    await flush()
    expect(playback.currentTrack?.id).toBe('t1')
    expect((playback as any).audio).not.toBe(preloaded)
  })

  it('queue end "repeat" wraps back to the first track', async () => {
    await setPrefs({ queueEnd: 'repeat' })
    playback.setQueue(makeItems(2), 1)
    await flush()
    ;(playback as any).audio.dispatch('ended')
    await flush()
    expect(playback.currentTrack?.id).toBe('t0')
  })

  it('queue end "radio" continues with an instant mix of the last track', async () => {
    await setPrefs({ queueEnd: 'radio' })
    playback.setQueue(makeItems(2), 1)
    await flush()
    ;(playback as any).audio.dispatch('ended')
    await flush()
    await flush()
    expect(playback.currentTrack?.id).toBe('mix1')
    expect(playback.context?.type).toBe('radio')
  })

  it('queue end "radio" stays put when the mix is empty or fails', async () => {
    await setPrefs({ queueEnd: 'radio' })
    const jf = (await import('./jellyfin')).jellyfin as any
    jf.getInstantMix = () => Promise.reject(new Error('down'))
    playback.setQueue(makeItems(1), 0)
    await flush()
    ;(playback as any).audio.dispatch('ended')
    await flush()
    expect(playback.currentTrack?.id).toBe('t0')
    jf.getInstantMix = () => Promise.resolve({ Items: [item('t0')] })
    ;(playback as any).audio.dispatch('ended')
    await flush()
    expect(playback.currentTrack?.id).toBe('t0')
  })

  describe('crossfade', () => {
    beforeEach(() => { vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }) })
    afterEach(() => { vi.useRealTimers() })

    it('fades the next track in while the current one fades out', async () => {
      await setPrefs({ crossfade: 4 })
      playback.setVolume(0.8)
      playback.setQueue(makeItems(3), 0)
      await flush()
      const oldAudio = (playback as any).audio
      const next = (playback as any)._preloadAudio
      oldAudio.currentTime = 97
      oldAudio.dispatch('timeupdate')
      expect(playback.currentTrack?.id).toBe('t1')
      expect((playback as any).audio).toBe(next)
      expect(next.volume).toBe(0)
      oldAudio.dispatch('timeupdate') // ignored: no longer current
      vi.advanceTimersByTime(1500)
      expect(next.volume).toBeGreaterThan(0)
      expect(oldAudio.volume).toBeLessThan(0.8)
      vi.advanceTimersByTime(2000)
      expect(next.volume).toBeCloseTo(0.8)
      expect(oldAudio.src).toBe('')
      await flush()
    })

    it('does not crossfade when off, when nothing is preloaded, or too early', async () => {
      playback.setQueue(makeItems(3), 0)
      await flush()
      const a = (playback as any).audio
      a.currentTime = 99
      a.dispatch('timeupdate')
      expect(playback.currentTrack?.id).toBe('t0')
      await setPrefs({ crossfade: 4 })
      a.currentTime = 10
      a.dispatch('timeupdate')
      expect(playback.currentTrack?.id).toBe('t0')
      a.currentTime = 99
      ;(playback as any).invalidatePreload()
      a.dispatch('timeupdate')
      expect(playback.currentTrack?.id).toBe('t0')
    })

    it('a manual skip cancels a running fade', async () => {
      await setPrefs({ crossfade: 4 })
      playback.setQueue(makeItems(3), 0)
      await flush()
      const oldAudio = (playback as any).audio
      oldAudio.currentTime = 97
      oldAudio.dispatch('timeupdate')
      playback.next()
      expect(oldAudio.src).toBe('')
      expect((playback as any).audio.volume).toBe(1)
      vi.advanceTimersByTime(5000)
      await flush()
    })
  })
})
