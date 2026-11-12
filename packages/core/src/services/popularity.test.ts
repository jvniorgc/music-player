import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as pop from './popularity'
import type { JellyfinItem } from './jellyfin'

const {
  normalizeName, parseStats, getAlbumStats, getTrackStats, getArtistStats, usePopularityStore,
  CACHE_STORAGE_KEY, CACHE_TTL_MS, NEGATIVE_TTL_MS, MIN_START_INTERVAL_MS, MAX_CONCURRENT,
} = pop

const getInfo = () => vi.mocked(window.api.lastfmGetInfo)
const enable = () => usePopularityStore.setState({ enabled: true, available: true })
const trackJson = (listeners: number, playcount: number) => ({ track: { listeners: String(listeners), playcount: String(playcount) } })
const album = (o: Partial<JellyfinItem> = {}): JellyfinItem => ({ Id: 'a1', Name: 'OK Computer', Type: 'MusicAlbum', AlbumArtist: 'Radiohead', ...o })
/** Let the rate-limited queue start and settle everything. */
const flush = () => vi.advanceTimersByTimeAsync(5_000)

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.removeItem(CACHE_STORAGE_KEY)
  pop._resetPopularity()
})
afterEach(() => vi.useRealTimers())

describe('normalizeName', () => {
  it.each([
    ['Paranoid Android (Remastered 2017)', 'Paranoid Android'],
    ['Here Comes the Sun - 2011 Remaster', 'Here Comes the Sun'],
    ['Rumours (Deluxe Edition)', 'Rumours'],
    ['Abbey Road [Super Deluxe]', 'Abbey Road'],
    ['Song (feat. Someone)', 'Song'],
    ['Song feat. Someone', 'Song'],
    ['Song ft. Someone', 'Song'],
    ['Track - Mono Version', 'Track'],
    ['Live at Leeds (Live)', 'Live at Leeds (Live)'],
    ['  Plain  ', 'Plain'],
    ['(Remastered)', '(Remastered)'],
  ])('%s → %s', (input, out) => expect(normalizeName(input)).toBe(out))
})

describe('parseStats', () => {
  it('reads album, track and artist shapes including userplaycount', () => {
    expect(parseStats('album.getInfo', { album: { listeners: '10', playcount: '20', userplaycount: '3' } }))
      .toEqual({ listeners: 10, playcount: 20, userPlaycount: 3 })
    expect(parseStats('track.getInfo', trackJson(1, 2))).toEqual({ listeners: 1, playcount: 2 })
    expect(parseStats('artist.getInfo', { artist: { stats: { listeners: 5, playcount: 6 } } })).toEqual({ listeners: 5, playcount: 6 })
  })

  it('returns null for missing or malformed data', () => {
    expect(parseStats('album.getInfo', null)).toBeNull()
    expect(parseStats('track.getInfo', { track: { listeners: 'x', playcount: '1' } })).toBeNull()
    expect(parseStats('track.getInfo', { track: { listeners: '1', playcount: '' } })).toBeNull()
    expect(parseStats('artist.getInfo', { artist: {} })).toBeNull()
  })
})

describe('settings', () => {
  it('loads toggle + availability once and tolerates failures', async () => {
    vi.mocked(window.api.getSetting).mockResolvedValueOnce('1')
    vi.mocked(window.api.lastfmGetStatus).mockResolvedValueOnce({ configured: true, connected: true, enabled: true, username: 'me' })
    await pop.loadPopularitySettings()
    await pop.loadPopularitySettings()
    expect(window.api.getSetting).toHaveBeenCalledTimes(1)
    expect(pop.isPopularityActive()).toBe(true)

    vi.mocked(window.api.getSetting).mockRejectedValueOnce(new Error('x'))
    vi.mocked(window.api.lastfmGetStatus).mockRejectedValueOnce(new Error('x'))
    await pop.loadPopularitySettings(true)
    expect(usePopularityStore.getState()).toMatchObject({ enabled: false, available: false, loaded: true })
  })

  it('persists the toggle', async () => {
    await pop.setPopularityEnabled(true)
    expect(window.api.setSetting).toHaveBeenCalledWith(pop.POPULARITY_SETTING_KEY, '1')
    expect(usePopularityStore.getState().enabled).toBe(true)
  })
})

describe('lookups', () => {
  it('makes no requests when disabled or unavailable', async () => {
    expect(await getTrackStats('A', 'B')).toBeNull()
    usePopularityStore.setState({ enabled: true, available: false })
    expect(await getArtistStats('A')).toBeNull()
    expect(await getAlbumStats(album())).toBeNull()
    expect(getInfo()).not.toHaveBeenCalled()
  })

  it('skips empty names', async () => {
    enable()
    expect(await getTrackStats('', 'B')).toBeNull()
    expect(await getArtistStats(' ')).toBeNull()
    expect(await getAlbumStats(album({ AlbumArtist: undefined }))).toBeNull()
    expect(getInfo()).not.toHaveBeenCalled()
  })

  it('queries normalized names and caches results for 7 days', async () => {
    enable()
    getInfo().mockResolvedValue(trackJson(100, 1000))
    const p = getTrackStats('Radiohead', 'Airbag (Remastered)')
    await flush()
    expect(await p).toEqual({ listeners: 100, playcount: 1000 })
    expect(getInfo()).toHaveBeenCalledWith('track.getInfo', { artist: 'Radiohead', track: 'Airbag' })
    expect(pop.peekCached(pop.trackKey('radiohead', 'airbag'))).toEqual({ listeners: 100, playcount: 1000 })

    expect(await getTrackStats('Radiohead', 'Airbag')).toEqual({ listeners: 100, playcount: 1000 })
    expect(getInfo()).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(CACHE_TTL_MS)
    const again = getTrackStats('Radiohead', 'Airbag')
    await flush()
    await again
    expect(getInfo()).toHaveBeenCalledTimes(2)
  })

  it('caches not-found for 1 day and does not cache errors', async () => {
    enable()
    getInfo().mockResolvedValueOnce(null)
    const p = getArtistStats('Nobody')
    await flush()
    expect(await p).toBeNull()
    expect(await getArtistStats('Nobody')).toBeNull()
    expect(getInfo()).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(NEGATIVE_TTL_MS)
    getInfo().mockRejectedValueOnce(new Error('offline'))
    const q = getArtistStats('Nobody')
    await flush()
    expect(await q).toBeNull()
    expect(pop.peekCached(pop.artistKey('Nobody'))).toBeUndefined()
  })

  it('dedupes concurrent requests', async () => {
    enable()
    getInfo().mockResolvedValue({ artist: { stats: { listeners: '1', playcount: '2' } } })
    const a = getArtistStats('Björk')
    const b = getArtistStats('björk')
    expect(b).toBe(a)
    await flush()
    expect(getInfo()).toHaveBeenCalledTimes(1)
  })

  it('tries the MusicBrainz album id first, then falls back to names', async () => {
    enable()
    getInfo().mockResolvedValueOnce(null).mockResolvedValueOnce({ album: { listeners: '7', playcount: '8', userplaycount: '9' } })
    const p = getAlbumStats(album({ Name: 'OK Computer (Deluxe)', ProviderIds: { MusicBrainzAlbum: 'mb-1' } }))
    await flush()
    expect(await p).toEqual({ listeners: 7, playcount: 8, userPlaycount: 9 })
    expect(getInfo().mock.calls).toEqual([
      ['album.getInfo', { mbid: 'mb-1' }],
      ['album.getInfo', { artist: 'Radiohead', album: 'OK Computer' }],
    ])

    getInfo().mockResolvedValueOnce({ album: { listeners: '1', playcount: '1' } })
    const q = getAlbumStats(album({ Id: 'a2', Name: 'Kid A', AlbumArtist: undefined, Artists: ['Radiohead'], ProviderIds: { MusicBrainzAlbum: 'mb-2' } }))
    await flush()
    expect(await q).toEqual({ listeners: 1, playcount: 1 })
    expect(getInfo()).toHaveBeenCalledTimes(3)
  })

  it('limits concurrency and spaces request starts', async () => {
    enable()
    const resolvers: (() => void)[] = []
    getInfo().mockImplementation(() => new Promise(r => resolvers.push(() => r(trackJson(1, 1)))))
    const all = Promise.all([1, 2, 3, 4, 5].map(i => getTrackStats('A', `T${i}`)))
    expect(getInfo()).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(MIN_START_INTERVAL_MS * 10)
    expect(getInfo()).toHaveBeenCalledTimes(MAX_CONCURRENT)
    resolvers.splice(0).forEach(r => r())
    await vi.advanceTimersByTimeAsync(MIN_START_INTERVAL_MS * 10)
    expect(getInfo()).toHaveBeenCalledTimes(5)
    resolvers.splice(0).forEach(r => r())
    await all
  })
})

describe('persistence', () => {
  it('writes the cache to localStorage and reloads non-expired entries', async () => {
    enable()
    getInfo().mockResolvedValue(trackJson(3, 4))
    const p = getTrackStats('A', 'B')
    await flush()
    await p
    const stored = JSON.parse(localStorage.getItem(CACHE_STORAGE_KEY)!)
    const key = pop.trackKey('A', 'B')
    expect(stored[key].v).toEqual({ listeners: 3, playcount: 4 })

    stored['track:old|x'] = { v: null, exp: Date.now() - 1 }
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(stored))
    pop._resetPopularity()
    expect(pop.peekCached(key)).toEqual({ listeners: 3, playcount: 4 })
    expect(pop.peekCached('track:old|x')).toBeUndefined()
  })

  it('ignores a corrupt cache and storage quota errors', async () => {
    localStorage.setItem(CACHE_STORAGE_KEY, '{bad')
    expect(pop.peekCached('x')).toBeUndefined()
    enable()
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    getInfo().mockResolvedValue(trackJson(1, 1))
    const p = getTrackStats('A', 'B')
    await flush()
    expect(await p).toEqual({ listeners: 1, playcount: 1 })
    spy.mockRestore()
  })

  it('reset cancels a pending persist', async () => {
    enable()
    getInfo().mockResolvedValue(trackJson(1, 1))
    const p = getTrackStats('A', 'B')
    await vi.advanceTimersByTimeAsync(0)
    await p
    pop._resetPopularity()
    await flush()
    expect(localStorage.getItem(CACHE_STORAGE_KEY)).toBeNull()
  })
})

describe('meter helpers', () => {
  it('computes levels relative to the max', () => {
    expect(pop.meterLevel(0, 100)).toBe(0)
    expect(pop.meterLevel(5, 0)).toBe(0)
    expect(pop.meterLevel(1, 1000)).toBe(1)
    expect(pop.meterLevel(500, 1000)).toBe(3)
    expect(pop.meterLevel(1000, 1000)).toBe(5)
    expect(pop.meterLevel(2000, 1000)).toBe(5)
  })

  it('tracks the max plays per group', () => {
    pop.reportTrackPlays('g', 10)
    pop.reportTrackPlays('g', 5)
    expect(usePopularityStore.getState().maxPlays.g).toBe(10)
  })

  it('picks the track artist', () => {
    expect(pop.trackArtist(album({ Artists: ['X'] }))).toBe('X')
    expect(pop.trackArtist(album())).toBe('Radiohead')
    expect(pop.trackArtist(album({ AlbumArtist: undefined }))).toBe('')
  })
})

describe('clearPopularityCache', () => {
  it('drops memory and stored cache', async () => {
    const { clearPopularityCache, CACHE_STORAGE_KEY, peekCached } = await import('./popularity')
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify({ k: { v: { listeners: 1, playcount: 1 }, exp: Date.now() + 1e6 } }))
    clearPopularityCache()
    expect(localStorage.getItem(CACHE_STORAGE_KEY)).toBeNull()
    expect(peekCached('k')).toBeUndefined()
  })
})
