import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as plays from './plays'
import * as social from './social'
import { jellyfin } from './jellyfin'
import { usePlayerStore } from '../stores/player'
import { usePrivacyPrefs } from '../stores/prefs/privacy'
import { jsonRes, mockFetchRouter } from '@test/http'

const item = (over: Record<string, unknown> = {}) => ({
  Id: 't1', Name: 'Song', AlbumId: 'al1', Album: 'Album', Artists: ['A'], ArtistItems: [{ Id: 'ar1', Name: 'A' }],
  RunTimeTicks: 200 * 10_000_000, ...over,
}) as never

beforeEach(() => {
  window.api.allowOrigin = vi.fn().mockResolvedValue(undefined)
  jellyfin.setAuth({ serverUrl: 'http://jf:8096', token: 'tok', userId: 'u1', username: 'ana', serverId: 's' } as never)
  social.configure('http://social:8099')
  usePrivacyPrefs.getState().set({ privateSession: false })
})

describe('toPlay / threshold', () => {
  it('builds a payload', () => {
    expect(plays.toPlay(item(), 0, 5)).toEqual({
      trackId: 't1', trackName: 'Song', artists: ['A'], artistId: 'ar1', albumId: 'al1', albumName: 'Album', durationS: 200, playedAt: 5,
    })
    expect(plays.toPlay(item({ Artists: [], AlbumArtist: 'AA', ArtistItems: undefined, AlbumArtists: [{ Id: 'aa' }], RunTimeTicks: 0 }), 99.6, 1))
      .toMatchObject({ artists: ['AA'], artistId: 'aa', durationS: 100 })
    expect(plays.toPlay(item({ Artists: undefined, ArtistItems: undefined }), 0, 1)).toMatchObject({ artists: [] })
    expect(plays.toPlay(item({ AlbumId: undefined }), 0, 1)).toBeNull()
    expect(plays.toPlay(item({ Id: '' }), 0, 1)).toBeNull()
    expect(plays.toPlay(item({ Name: '' }), 0, 1)).toBeNull()
    expect(plays.toPlay(item({ Album: '' }), 0, 1)).toBeNull()
    expect('artistId' in plays.toPlay(item({ ArtistItems: [] }), 0, 1)!).toBe(false)
  })

  it('uses half the track or 4 minutes, whichever first', () => {
    expect(plays.playThreshold(200)).toBe(100)
    expect(plays.playThreshold(1000)).toBe(240)
    expect(plays.playThreshold(0)).toBe(240)
  })
})

describe('reportPlay', () => {
  it('posts the play and swallows failures', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetch = mockFetchRouter([['/plays', jsonRes({ error: 'x' }, 500)]])
    plays.reportPlay(plays.toPlay(item(), 0, 1)!)
    await vi.waitFor(() => expect(warn).toHaveBeenCalled())
    expect(fetch.mock.calls[0][0]).toBe('http://social:8099/plays')
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toMatchObject({ trackId: 't1' })
  })

  it('skips when private or not configured', () => {
    const fetch = mockFetchRouter([])
    usePrivacyPrefs.getState().set({ privateSession: true })
    plays.reportPlay(plays.toPlay(item(), 0, 1)!)
    usePrivacyPrefs.getState().set({ privateSession: false })
    social.configure('')
    plays.reportPlay(plays.toPlay(item(), 0, 1)!)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('initPlayScrobbler', () => {
  let stop: () => void
  let fetch: ReturnType<typeof mockFetchRouter>
  beforeEach(() => {
    fetch = mockFetchRouter([['/plays', jsonRes({ id: 1 }, 201)]])
    usePlayerStore.setState({ currentTrack: null, currentTime: 0, isPlaying: false, duration: 0 })
    stop = plays.initPlayScrobbler()
  })
  afterEach(() => stop())

  const tick = (to: number, playing = true) => usePlayerStore.setState({ currentTime: to, isPlaying: playing })
  const listen = (from: number, to: number) => { for (let s = from; s <= to; s++) tick(s) }

  it('reports once after half the track, ignoring seeks and paused time', () => {
    const track = { id: 'q1', item: item() }
    usePlayerStore.setState({ currentTrack: track, currentTime: 0, duration: 200 })
    tick(150) // seek
    tick(160, false)
    tick(150) // backwards
    listen(151, 200)
    expect(fetch).not.toHaveBeenCalled()
    tick(0)
    listen(1, 100)
    expect(fetch).toHaveBeenCalledTimes(1)
    listen(101, 199)
    expect(fetch).toHaveBeenCalledTimes(1)
    // repeat-one: same queue entry restarts from the top -> new instance
    tick(0)
    listen(1, 100)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('starts a new instance on track change and ignores unusable tracks', () => {
    usePlayerStore.setState({ currentTrack: { id: 'q1', item: item({ AlbumId: undefined }) }, currentTime: 0, duration: 200 })
    listen(1, 150)
    usePlayerStore.setState({ currentTrack: null, currentTime: 0 })
    tick(5)
    expect(fetch).not.toHaveBeenCalled()
    usePlayerStore.setState({ currentTrack: { id: 'q2', item: item({ Id: 't2' }) }, currentTime: 0, duration: 200 })
    listen(1, 100)
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toMatchObject({ trackId: 't2' })
  })
})

describe('queries', () => {
  it('fetches rankings, discoveries and achievements', async () => {
    const fetch = mockFetchRouter([
      ['/rankings/week', () => jsonRes({ start: 's', tracks: [] })],
      ['/discoveries/recent', jsonRes({ items: [{ albumId: 'r' }] })],
      ['/discoveries?', jsonRes({ items: [{ albumId: 'a b' }] })],
      ['/achievements/me', jsonRes({ items: [{ id: 'me' }] })],
      ['/achievements', jsonRes({ items: [{ id: 'all' }] })],
    ])
    expect(await plays.getWeekRanking(1)).toMatchObject({ start: 's' })
    expect(fetch.mock.calls[0][0]).toContain('/rankings/week?offset=1')
    expect(await plays.getWeekRanking()).toMatchObject({ start: 's' })
    expect(await plays.getDiscoveries(['a b', 'c'])).toEqual([{ albumId: 'a b' }])
    expect(fetch.mock.calls[2][0]).toContain('/discoveries?albumIds=a%20b,c')
    expect(await plays.getDiscoveries([])).toEqual([])
    expect(await plays.getRecentDiscoveries()).toEqual([{ albumId: 'r' }])
    expect(await plays.getMyAchievements()).toEqual([{ id: 'me' }])
    expect(await plays.getAchievements()).toEqual([{ id: 'all' }])
  })
})
