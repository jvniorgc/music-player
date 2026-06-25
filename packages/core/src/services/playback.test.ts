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
    expect(seen).toContainEqual(['error', 'decode error'])
  })

  it('falls back to a generic error message when the media error has none', async () => {
    playback.setQueue(makeItems(1), 0)
    await flush()
    const seen: Array<[string, unknown]> = []
    playback.on((e, d) => seen.push([e, d]))
    const audio = (playback as any).audio as FakeAudio
    audio.error = null
    audio.dispatch('error')
    expect(seen).toContainEqual(['error', 'Playback error'])
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
    expect(playback.currentTrack?.id).toBe('t1')
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
