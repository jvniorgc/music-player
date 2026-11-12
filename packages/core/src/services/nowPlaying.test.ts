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

  it('computes join position adjusted for elapsed time', () => {
    expect(joinPositionSeconds(entry(), 1000, 6000)).toBe(35)
    expect(joinPositionSeconds(entry({ isPaused: true }), 1000, 6000)).toBe(30)
    expect(joinPositionSeconds(entry({ positionTicks: 1_990_000_000 }), 0, 60_000)).toBe(199)
    expect(joinPositionSeconds(entry({ item: { ...entry().item, runTimeTicks: null } }), 0, 10_000)).toBe(40)
  })
})
