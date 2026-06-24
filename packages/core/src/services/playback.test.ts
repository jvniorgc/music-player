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

describe('queue setup', () => {
  it('setQueue loads tracks and starts at the requested index', async () => {
    const events: string[] = []
    playback.on(e => events.push(e))
    playback.setQueue(makeItems(3), 1)
    expect(playback.queue).toHaveLength(3)
    expect(playback.currentIndex).toBe(1)
    expect(playback.currentTrack?.id).toBe('t1')
    expect(events).toContain('trackchange')
    await flush()
  })
})

describe('linear navigation (repeat: none)', () => {
  beforeEach(() => playback.setQueue(makeItems(3), 0))

  it('next advances and stops at the end', () => {
    playback.next()
    expect(playback.currentIndex).toBe(1)
    playback.next()
    expect(playback.currentIndex).toBe(2)
    playback.next() // no next track -> stays put
    expect(playback.currentIndex).toBe(2)
  })

  it('previous goes back and stops at the start', () => {
    playback.next()
    playback.next()
    playback.previous()
    expect(playback.currentIndex).toBe(1)
    playback.previous()
    expect(playback.currentIndex).toBe(0)
    playback.previous() // already first
    expect(playback.currentIndex).toBe(0)
  })

  it('previous restarts the track when more than 3s have elapsed', () => {
    playback.next()
    ;(playback as unknown as { audio: FakeAudio }).audio.currentTime = 5
    playback.previous()
    expect(playback.currentIndex).toBe(1)
    expect(playback.currentTime).toBe(0)
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
    expect(playback.currentIndex).toBe(2)
    playback.next()
    expect(playback.currentIndex).toBe(0)
  })

  it('repeat one keeps the same track on next', () => {
    playback.toggleRepeat()
    playback.toggleRepeat() // one
    playback.next()
    expect(playback.currentIndex).toBe(0)
  })
})

describe('queue mutation', () => {
  beforeEach(() => playback.setQueue(makeItems(3), 0))

  it('addToQueue appends and emits queuechange', () => {
    const events: string[] = []
    playback.on(e => events.push(e))
    playback.addToQueue({ Id: 'new', Name: 'New', Type: 'Audio' })
    expect(playback.queue.map(t => t.id)).toEqual(['t0', 't1', 't2', 'new'])
    expect(events).toContain('queuechange')
  })

  it('addNext inserts immediately after the current track', () => {
    playback.next() // index 1
    playback.addNext({ Id: 'inserted', Name: 'I', Type: 'Audio' })
    expect(playback.queue[2].id).toBe('inserted')
  })

  it('removeFromQueue removes a non-current track and shifts the index', () => {
    playback.next() // index 1
    playback.removeFromQueue(0)
    expect(playback.queue.map(t => t.id)).toEqual(['t1', 't2'])
    expect(playback.currentIndex).toBe(0)
  })

  it('removeFromQueue is a no-op for the current track', () => {
    playback.next()
    playback.removeFromQueue(1)
    expect(playback.queue).toHaveLength(3)
  })

  it('clearQueue empties everything and emits a null trackchange', () => {
    const seen: Array<[string, unknown]> = []
    playback.on((e, d) => seen.push([e, d]))
    playback.clearQueue()
    expect(playback.queue).toEqual([])
    expect(playback.currentIndex).toBe(-1)
    expect(seen).toContainEqual(['trackchange', null])
  })
})

describe('shuffle', () => {
  it('toggleShuffle keeps the current track playing and emits shufflechange', () => {
    playback.setQueue(makeItems(5), 2)
    const events: string[] = []
    playback.on(e => events.push(e))
    vi.spyOn(Math, 'random').mockReturnValue(0)
    playback.toggleShuffle()
    expect(playback.shuffle).toBe(true)
    expect(events).toContain('shufflechange')
    // Current track stays selected (shuffle order places it first).
    expect(playback.currentTrack?.id).toBe('t2')
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
})

describe('track ended handling', () => {
  it('advances to the next track when the current one ends', async () => {
    playback.setQueue(makeItems(3), 0)
    await flush()
    ;(playback as any).audio.dispatch('ended')
    await flush()
    expect(playback.currentIndex).toBe(1)
  })

  it('emits queueend when the final track ends with repeat off', async () => {
    playback.setQueue(makeItems(2), 1)
    await flush()
    const events: string[] = []
    playback.on(e => events.push(e))
    ;(playback as any).audio.dispatch('ended')
    await flush()
    expect(events).toContain('queueend')
    expect(playback.currentIndex).toBe(1)
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
})

describe('shuffle navigation wrap-around', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
  })

  it('next from the last shuffle position wraps to the first with repeat all', () => {
    playback.setQueue(makeItems(3), 0)
    playback.toggleShuffle()
    playback.toggleRepeat() // all
    playback.next()
    playback.next() // now at the last shuffle position
    playback.next() // wraps
    expect((playback as any)._currentIndex).toBe((playback as any)._shuffleOrder[0])
  })

  it('previous from the first shuffle position wraps to the last with repeat all', () => {
    playback.setQueue(makeItems(3), 0)
    playback.toggleShuffle()
    playback.toggleRepeat() // all
    const order = (playback as any)._shuffleOrder
    playback.previous() // at pos 0 -> wraps to last
    expect((playback as any)._currentIndex).toBe(order[order.length - 1])
  })

  it('returns null (stops) at shuffle boundaries when repeat is off', () => {
    playback.setQueue(makeItems(2), 0)
    playback.toggleShuffle()
    const order = (playback as any)._shuffleOrder
    // Jump to the last shuffle position; next() should not advance past the end.
    ;(playback as any)._currentIndex = order[order.length - 1]
    playback.next()
    expect((playback as any)._currentIndex).toBe(order[order.length - 1])
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

  it('ignores events from a stale (non-current) audio element', async () => {
    playback.setQueue(makeItems(1), 0)
    await flush()
    const stale = (playback as any).audio as FakeAudio
    // Swap in a different element so `stale` is no longer current.
    ;(playback as any).audio = new FakeAudio()
    const seen: string[] = []
    playback.on(e => seen.push(e))
    stale.dispatch('timeupdate')
    stale.dispatch('playing')
    expect(seen).not.toContain('timeupdate')
    expect(seen).not.toContain('playing')
  })
})

describe('source resolution error handling', () => {
  it('falls back to streaming when the download and cache lookups reject', async () => {
    vi.mocked(window.api.getDownloadPath).mockRejectedValue(new Error('disk error'))
    vi.mocked(window.api.getCachedAudio).mockRejectedValue(new Error('cache error'))
    playback.setQueue(makeItems(1), 0)
    await flush()
    expect(playback.currentTrack?.source).toBe('stream')
  })
})

describe('playback error & fallback', () => {
  it('retries via the universal endpoint when the direct stream fails to load', async () => {
    audioConfig.failLoad = true // first load() errors -> rejects the canplay wait
    playback.setQueue(makeItems(1), 0)
    await flush()
    await flush()
    // Fallback path sets the universal URL and plays it successfully.
    expect((playback as any).audio.src).toContain('/universal?')
    expect(playback.currentIndex).toBe(0)
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
})

describe('preload error handling', () => {
  it('invalidates the preload when the preloaded element errors', async () => {
    playback.setQueue(makeItems(3), 0)
    await flush()
    expect((playback as any).nextAudio).not.toBeNull()
    ;(playback as any).nextAudio.dispatch('error')
    expect((playback as any).nextAudio).toBeNull()
    expect((playback as any).nextTrackReady).toBe(false)
  })

  it('invalidates the preload when resolving the next source rejects', async () => {
    playback.setQueue(makeItems(3), 0)
    await flush()
    const jf = (await import('./jellyfin')).jellyfin
    const original = jf.getStreamUrl
    ;(jf as any).getStreamUrl = () => { throw new Error('no url') }
    ;(playback as any).invalidatePreload()
    ;(playback as any).nextTrackIndex = null
    ;(playback as any).preloadNext()
    await flush()
    expect((playback as any).nextAudio).toBeNull()
    ;(jf as any).getStreamUrl = original
  })
})

describe('track ended without a ready preload', () => {
  it('plays the next track directly when nothing is preloaded', async () => {
    playback.setQueue(makeItems(3), 0)
    await flush()
    ;(playback as any).invalidatePreload()
    ;(playback as any).audio.dispatch('ended')
    await flush()
    expect(playback.currentIndex).toBe(1)
  })

  it('falls back to playTrack when a gapless transition fails to play', async () => {
    playback.setQueue(makeItems(3), 0)
    await flush()
    // A preload is ready; force the swapped element's play() to reject.
    expect((playback as any).nextTrackReady).toBe(true)
    audioConfig.failPlay = true
    ;(playback as any).audio.dispatch('ended')
    await flush()
    await flush()
    expect(playback.currentIndex).toBe(1)
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
