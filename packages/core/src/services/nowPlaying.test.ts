import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as social from './social'
import { jellyfin } from './jellyfin'
import { listNowPlaying, joinPositionSeconds, type FriendNowPlaying } from './nowPlaying'
import { jsonRes, mockFetchRouter } from '@test/http'

const entry = (over: Partial<FriendNowPlaying> = {}): FriendNowPlaying => ({
  userId: 'bia', userName: 'Bia', client: 'Web', deviceName: 'Firefox',
  item: { id: 'i1', name: 'Song', artists: ['Art'], album: 'Alb', albumId: 'a1', runTimeTicks: 2_000_000_000 },
  positionTicks: 300_000_000, isPaused: false, lastActivity: null, ...over,
})

beforeEach(() => {
  window.api.allowOrigin = vi.fn().mockResolvedValue(undefined)
  jellyfin.setAuth({ serverUrl: 'http://jf:8096', token: 'tok', userId: 'u1', username: 'ana', serverId: 's' } as never)
  social.configure('http://social:8099/')
})

describe('nowPlaying service', () => {
  it('fetches /now-playing items', async () => {
    const fetchMock = mockFetchRouter([['/now-playing', () => jsonRes({ items: [entry()] })]])
    expect(await listNowPlaying()).toEqual([entry()])
    expect(String(fetchMock.mock.calls[0][0])).toBe('http://social:8099/now-playing')
  })

  it('falls back to Jellyfin sessions when the social API is not configured', async () => {
    social.configure('')
    const sessions = [
      { UserId: 'bia', UserName: 'Bia', Client: 'Finamp', DeviceName: 'Pixel', LastActivityDate: 'd',
        NowPlayingItem: { Id: 'i1', Name: 'Song', Type: 'Audio', Artists: ['Art'], Album: 'Alb', AlbumId: 'a1', RunTimeTicks: 2_000_000_000 },
        PlayState: { PositionTicks: 300_000_000, IsPaused: false } },
      { UserId: 'cid', UserName: 'Cid', NowPlayingItem: { Id: 'i2', Name: 'Bare', Type: 'Audio' } },
      { UserId: 'u1', UserName: 'ana', NowPlayingItem: { Id: 'i3', Name: 'Mine', Type: 'Audio' } },
      { UserId: 'dan', NowPlayingItem: { Id: 'v', Name: 'Movie', Type: 'Movie' } },
      { UserName: 'nobody', NowPlayingItem: { Id: 'i4', Name: 'X', Type: 'Audio' } },
      { UserId: 'eve' },
    ]
    const fetchMock = mockFetchRouter([['/Sessions', () => jsonRes(sessions)]])
    expect(await listNowPlaying()).toEqual([
      entry({ client: 'Finamp', deviceName: 'Pixel', lastActivity: 'd' }),
      { userId: 'cid', userName: 'Cid', client: null, deviceName: null, positionTicks: 0, isPaused: false, lastActivity: null,
        item: { id: 'i2', name: 'Bare', artists: [], album: null, albumId: null, runTimeTicks: null } },
    ])
    expect(String(fetchMock.mock.calls[0][0])).toBe('http://jf:8096/Sessions?ActiveWithinSeconds=120')
  })

  it('falls back to Jellyfin sessions when the social API fails', async () => {
    mockFetchRouter([
      ['/now-playing', () => new Response('x', { status: 503 })],
      ['/Sessions', () => jsonRes([])],
    ])
    expect(await listNowPlaying()).toEqual([])
  })

  it('computes join position adjusted for elapsed time', () => {
    expect(joinPositionSeconds(entry(), 1000, 6000)).toBe(35)
    expect(joinPositionSeconds(entry({ isPaused: true }), 1000, 6000)).toBe(30)
    expect(joinPositionSeconds(entry({ positionTicks: 1_990_000_000 }), 0, 60_000)).toBe(199)
    expect(joinPositionSeconds(entry({ item: { ...entry().item, runTimeTicks: null } }), 0, 10_000)).toBe(40)
  })
})
