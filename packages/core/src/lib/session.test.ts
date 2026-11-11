import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  serializeSession, parseSession, minimalItem, loadSession, saveSession, startSessionPersistence,
  SESSION_KEY, MAX_STORED_TRACKS, SAVE_INTERVAL_MS,
} from './session'
import type { PlaybackSnapshot } from '../services/playback'
import type { JellyfinItem } from '../services/jellyfin'

const owner = { serverUrl: 'https://jf', userId: 'u1' }
const item = (id: string, extra: Partial<JellyfinItem> = {}): JellyfinItem => ({ Id: id, Name: id, Type: 'Audio', ...extra })
const items = (n: number) => Array.from({ length: n }, (_, i) => item(`t${i}`))

const snap = (over: Partial<PlaybackSnapshot> = {}): PlaybackSnapshot => ({
  current: item('t1'), items: items(3), position: 1, userQueue: [item('q')],
  time: 12.34, shuffle: true, repeat: 'all', context: { type: 'album', id: 'a', name: 'A' }, ...over,
})

beforeEach(() => localStorage.clear())

describe('session serialization', () => {
  it('round-trips a snapshot', () => {
    const parsed = parseSession(serializeSession(snap(), owner), owner)
    expect(parsed).toEqual({ ...snap(), time: 12.3 })
  })

  it('keeps only minimal metadata', () => {
    const full = item('x', {
      Album: 'Al', AlbumId: 'al', AlbumArtist: 'AA', Artists: ['A'], ArtistItems: [{ Id: 'ar', Name: 'A' }],
      AlbumArtists: [{ Id: 'aa', Name: 'AA' }], RunTimeTicks: 10, IndexNumber: 0,
      ImageTags: { Primary: 'p', Backdrop: 'b' }, Overview: 'long text', MediaSources: [],
    })
    expect(minimalItem(full)).toEqual({
      Id: 'x', Name: 'x', Type: 'Audio', Album: 'Al', AlbumId: 'al', AlbumArtist: 'AA', Artists: ['A'],
      ArtistItems: [{ Id: 'ar', Name: 'A' }], AlbumArtists: [{ Id: 'aa', Name: 'AA' }], RunTimeTicks: 10,
      IndexNumber: 0, ImageTags: { Primary: 'p' },
    })
    expect(minimalItem({ Id: 'y', Name: 'y' } as JellyfinItem).Type).toBe('Audio')
  })

  it('caps stored tracks around the current position', () => {
    const big = items(2000)
    const parsed = parseSession(serializeSession(snap({ items: big, position: 1000, current: big[1000], userQueue: items(10) }), owner), owner)!
    expect(parsed.items.length + parsed.userQueue.length).toBeLessThan(MAX_STORED_TRACKS)
    expect(parsed.items[parsed.position].Id).toBe('t1000')
    expect(parsed.items[0].Id).toBe('t950')

    const noCursor = parseSession(serializeSession(snap({ items: big, position: -1 }), owner), owner)!
    expect(noCursor.position).toBe(-1)
    expect(noCursor.items[0].Id).toBe('t0')
  })

  it('normalizes invalid time and missing context', () => {
    const parsed = parseSession(serializeSession(snap({ time: NaN, context: null, shuffle: false }), owner), owner)!
    expect(parsed.time).toBe(0)
    expect(parsed.context).toBeNull()
  })

  it.each([
    ['null', null],
    ['garbage', '{nope'],
    ['non-object', '42'],
    ['wrong version', JSON.stringify({ ...JSON.parse(serializeSession(snap(), owner)), v: 99 })],
    ['other user', serializeSession(snap(), { ...owner, userId: 'u2' })],
    ['other server', serializeSession(snap(), { ...owner, serverUrl: 'https://other' })],
    ['bad current', JSON.stringify({ ...JSON.parse(serializeSession(snap(), owner)), current: { Id: 5 } })],
  ])('rejects %s', (_label, raw) => {
    expect(parseSession(raw as string | null, owner)).toBeNull()
  })

  it('drops invalid entries and sanitizes fields', () => {
    const stored = JSON.parse(serializeSession(snap(), owner))
    stored.items = [item('a'), { bad: true }, item('b'), item('c')]
    stored.position = 2
    stored.userQueue = [item('q'), null, 'x']
    stored.repeat = 'sometimes'
    stored.shuffle = 'yes'
    stored.time = -5
    stored.context = { type: 'evil', name: 'x' }
    const parsed = parseSession(JSON.stringify(stored), owner)!
    expect(parsed.items.map(i => i.Id)).toEqual(['a', 'b', 'c'])
    expect(parsed.position).toBe(1)
    expect(parsed.userQueue.map(i => i.Id)).toEqual(['q'])
    expect(parsed.repeat).toBe('none')
    expect(parsed.shuffle).toBe(false)
    expect(parsed.time).toBe(0)
    expect(parsed.context).toBeNull()

    stored.items = 'nope'
    stored.userQueue = undefined
    stored.position = 1.5
    stored.context = { type: 'search', name: 'q', id: 7 }
    const p2 = parseSession(JSON.stringify(stored), owner)!
    expect(p2.items).toEqual([])
    expect(p2.position).toBe(-1)
    expect(p2.context).toEqual({ type: 'search', name: 'q' })
  })

  it('saveSession/loadSession use localStorage and clear on null', () => {
    saveSession(snap(), owner)
    expect(loadSession(owner)?.current.Id).toBe('t1')
    saveSession(null, owner)
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('swallows storage errors', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full') })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    expect(() => saveSession(snap(), owner)).not.toThrow()
    expect(loadSession(owner)).toBeNull()
    expect(warn).toHaveBeenCalled()
    vi.restoreAllMocks()
  })
})

describe('startSessionPersistence', () => {
  function fakeEngine(current: PlaybackSnapshot | null) {
    let listener: (e: string) => void = () => {}
    return {
      getSnapshot: vi.fn(() => current),
      restoreSnapshot: vi.fn(async () => true),
      on: vi.fn((cb: (e: string) => void) => { listener = cb; return () => { listener = () => {} } }),
      emit: (e: string) => listener(e),
    }
  }
  const tick = () => new Promise(r => setTimeout(r, 0))

  it('restores the saved session and saves on events (throttled for progress)', async () => {
    saveSession(snap(), owner)
    const engine = fakeEngine(snap({ current: item('t2') }))
    const stop = startSessionPersistence(engine, owner)
    expect(engine.restoreSnapshot).toHaveBeenCalledWith(expect.objectContaining({ position: 1 }))
    engine.emit('queuechange') // ignored while restoring
    expect(engine.getSnapshot).not.toHaveBeenCalled()
    await tick()

    engine.emit('pause')
    expect(loadSession(owner)?.current.Id).toBe('t2')
    engine.getSnapshot.mockClear()
    engine.emit('timeupdate')
    expect(engine.getSnapshot).not.toHaveBeenCalled()
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + SAVE_INTERVAL_MS + 1)
    engine.emit('timeupdate')
    expect(engine.getSnapshot).toHaveBeenCalledTimes(1)
    engine.emit('ended')
    window.dispatchEvent(new Event('beforeunload'))
    expect(engine.getSnapshot).toHaveBeenCalledTimes(2)
    vi.restoreAllMocks()

    stop()
    engine.getSnapshot.mockClear()
    window.dispatchEvent(new Event('beforeunload'))
    expect(engine.getSnapshot).not.toHaveBeenCalled()
  })

  it('skips restore when nothing is saved and tolerates restore failures', async () => {
    const engine = fakeEngine(null)
    startSessionPersistence(engine, owner)()
    expect(engine.restoreSnapshot).not.toHaveBeenCalled()

    saveSession(snap(), owner)
    const failing = fakeEngine(null)
    failing.restoreSnapshot.mockRejectedValue(new Error('x'))
    const stop = startSessionPersistence(failing, owner)
    await tick()
    failing.emit('trackchange')
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
    stop()
  })
})
