import { describe, it, expect, beforeEach } from 'vitest'
import * as social from './social'
import * as reactions from './reactions'
import { jellyfin } from './jellyfin'
import { jsonRes, emptyRes, mockFetchRouter } from '@test/http'

const S = { reactions: [{ emoji: '🔥', count: 1, mine: true, users: ['Ana'] }], comments: [] }

beforeEach(() => {
  jellyfin.setAuth({ serverUrl: 'http://jf:8096', token: 'tok', userId: 'u1', username: 'ana', serverId: 's' } as never)
  social.configure('http://social:8099')
})

describe('reactions service', () => {
  it('gets the social data for an item', async () => {
    const f = mockFetchRouter([['/items/a%2Fb/social', jsonRes(S)]])
    expect(await reactions.getSocial('a/b')).toEqual(S)
    expect(f.mock.calls[0][0]).toBe('http://social:8099/items/a%2Fb/social')
  })

  it('toggles reactions with PUT / DELETE and the item type', async () => {
    const f = mockFetchRouter([['/reactions/', () => jsonRes(S)]])
    await reactions.setReaction('t1', 'track', '🔥', true)
    await reactions.setReaction('t1', 'album', '❤️', false)
    expect(f.mock.calls[0][0]).toBe(`http://social:8099/items/t1/reactions/${encodeURIComponent('🔥')}?item_type=track`)
    expect(f.mock.calls[0][1]?.method).toBe('PUT')
    expect(f.mock.calls[1][0]).toContain('item_type=album')
    expect(f.mock.calls[1][1]?.method).toBe('DELETE')
  })

  it('posts and deletes comments', async () => {
    const c = { id: 3, body: 'hi' }
    const f = mockFetchRouter([['/comments/3', emptyRes()], ['/items/t1/comments', jsonRes(c, 201)]])
    expect(await reactions.addComment('t1', 'track', 'hi', 12)).toEqual(c)
    expect(JSON.parse(f.mock.calls[0][1]!.body as string)).toEqual({ item_type: 'track', body: 'hi', positionSeconds: 12 })
    await reactions.addComment('t1', 'album', 'yo')
    expect(JSON.parse(f.mock.calls[1][1]!.body as string)).toEqual({ item_type: 'album', body: 'yo' })
    await reactions.deleteComment(3)
    expect(f.mock.calls[2][1]?.method).toBe('DELETE')
  })

  it('fetches summaries in chunks of 200 and skips empty lists', async () => {
    expect(await reactions.getSummary([])).toEqual({})
    const ids = Array.from({ length: 250 }, (_, i) => `i${i}`)
    const f = mockFetchRouter([['/social/summary', (_u, init) => {
      const first = JSON.parse(init!.body as string).ids[0]
      return jsonRes({ items: { [first]: { reactions: 1, comments: 0, mine: [], top: ['🔥'] } } })
    }]])
    const out = await reactions.getSummary(ids)
    expect(f).toHaveBeenCalledTimes(2)
    expect(Object.keys(out)).toEqual(['i0', 'i200'])
  })
})
