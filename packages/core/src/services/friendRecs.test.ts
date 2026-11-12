import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as social from './social'
import * as recs from './friendRecs'
import { jellyfin } from './jellyfin'
import { jsonRes, emptyRes, mockFetchRouter } from '@test/http'

const rec = { id: 1 }

beforeEach(() => {
  window.api.allowOrigin = vi.fn().mockResolvedValue(undefined)
  jellyfin.setAuth({ serverUrl: 'http://jf', token: 'tok', userId: 'u1', username: 'ana', serverId: 's' } as never)
  social.configure('http://social')
})

describe('friendRecs service', () => {
  it('calls the recommendations endpoints', async () => {
    const fetchMock = mockFetchRouter([
      ['/recommendations/inbox?unread=1', () => jsonRes({ items: [rec] })],
      ['/recommendations/inbox', () => jsonRes({ items: [rec, rec] })],
      ['/recommendations/sent', () => jsonRes({ items: [rec] })],
      ['/recommendations/unread-count', () => jsonRes({ count: 3 })],
      ['/recommendations/1/listened', () => jsonRes(rec)],
      ['/recommendations/1/reaction', () => jsonRes(rec)],
      ['/recommendations/1', () => emptyRes()],
      ['/recommendations', () => jsonRes({ items: [rec] }, 201)],
    ])
    vi.stubGlobal('fetch', fetchMock)
    const item = { type: 'track' as const, id: 't', name: 'S' }
    expect(await recs.sendRecommendation(['u2'], item, 'hi')).toEqual([rec])
    expect(await recs.sendRecommendation(['u2'], item)).toEqual([rec])
    expect(await recs.getInbox(true)).toEqual([rec])
    expect(await recs.getInbox()).toHaveLength(2)
    expect(await recs.getSent()).toEqual([rec])
    expect(await recs.getUnreadCount()).toBe(3)
    expect(await recs.markListened(1)).toEqual(rec)
    expect(await recs.setReaction(1, 'love')).toEqual(rec)
    await recs.deleteRecommendation(1)
    const calls = fetchMock.mock.calls.map(([u, i]) => [String(u), i?.method ?? 'GET', i?.body])
    expect(calls).toContainEqual(['http://social/recommendations', 'POST', JSON.stringify({ toUserIds: ['u2'], item, message: 'hi' })])
    expect(calls).toContainEqual(['http://social/recommendations', 'POST', JSON.stringify({ toUserIds: ['u2'], item })])
    expect(calls).toContainEqual(['http://social/recommendations/1/reaction', 'POST', JSON.stringify({ reaction: 'love' })])
    expect(calls).toContainEqual(['http://social/recommendations/1', 'DELETE', undefined])
  })

  it('builds an item snapshot from Jellyfin items', () => {
    expect(recs.itemFromJellyfin({ Id: 't', Name: 'S', Type: 'Audio', Artists: ['A'], AlbumId: 'al' } as never))
      .toEqual({ type: 'track', id: 't', name: 'S', artist: 'A', albumId: 'al' })
    expect(recs.itemFromJellyfin({ Id: 'al', Name: 'Alb', Type: 'MusicAlbum', AlbumArtist: 'B' } as never))
      .toEqual({ type: 'album', id: 'al', name: 'Alb', artist: 'B', albumId: 'al' })
    expect(recs.itemFromJellyfin({ Id: 'ar', Name: 'Art', Type: 'MusicArtist' } as never))
      .toEqual({ type: 'artist', id: 'ar', name: 'Art' })
    expect(recs.itemFromJellyfin({ Id: 't', Name: 'S', Type: 'Audio' } as never))
      .toEqual({ type: 'track', id: 't', name: 'S' })
  })

  it('matches a playing track against a recommendation', () => {
    const track = { Id: 't', AlbumId: 'al' } as never
    const r = (type: string, id: string) => ({ item: { type, id } }) as never
    expect(recs.matchesTrack(r('track', 't'), track)).toBe(true)
    expect(recs.matchesTrack(r('album', 'al'), track)).toBe(true)
    expect(recs.matchesTrack(r('track', 'x'), track)).toBe(false)
    expect(recs.matchesTrack(r('album', 'x'), track)).toBe(false)
    expect(recs.matchesTrack(r('artist', 't'), track)).toBe(false)
  })
})
