import { describe, it, expect, beforeEach } from 'vitest'
import { jellyfin } from './jellyfin'
import * as social from './social'
import { jsonRes, emptyRes, mockFetchRouter } from '@test/http'

const AUTH = { serverUrl: 'http://jf.local', token: 'TKN', userId: 'u1', username: 'me', serverId: 's1' }
const API = 'http://api.local'

beforeEach(() => {
  jellyfin.setAuth({ ...AUTH })
  social.configure('')
})

const body = (init?: RequestInit) => JSON.parse(init?.body as string)

describe('playlist and stats routing through the social API', () => {
  beforeEach(() => social.configure(API))

  it('renamePlaylist PUTs the name to the API', async () => {
    const f = mockFetchRouter([[`${API}/playlists/p1/name`, emptyRes(204)]])
    await jellyfin.renamePlaylist('p1', 'New')
    expect(f).toHaveBeenCalledTimes(1)
    expect(f.mock.calls[0][1]?.method).toBe('PUT')
    expect(body(f.mock.calls[0][1])).toEqual({ name: 'New' })
  })

  it('setPlaylistImage PUTs base64 data and content type', async () => {
    const f = mockFetchRouter([[`${API}/playlists/p1/image`, emptyRes(204)]])
    await jellyfin.setPlaylistImage('p1', new Blob(['abc'], { type: 'image/png' }))
    expect(f.mock.calls[0][1]?.method).toBe('PUT')
    expect(body(f.mock.calls[0][1])).toEqual({ contentType: 'image/png', data: btoa('abc') })
  })

  it('createPlaylist sets the owner tag through the API', async () => {
    const f = mockFetchRouter([
      [`${API}/playlists/p1/owner-tag`, emptyRes(204)],
      ['/Playlists', () => jsonRes({ Id: 'p1' })],
    ])
    await jellyfin.createPlaylist('Mix')
    expect(f.mock.calls.map(c => c[0])).toEqual(['http://jf.local/Playlists', `${API}/playlists/p1/owner-tag`])
    expect(f.mock.calls[1][1]?.method).toBe('POST')
  })

  it('top-items stats come from the API', async () => {
    const f = mockFetchRouter([
      [`${API}/stats/top-items`, jsonRes({ items: [{ itemId: 's1', playCount: 3 }] })],
      ['/Items?Ids=s1', jsonRes({ Items: [{ Id: 's1', Name: 'Song', Type: 'Audio' }], TotalRecordCount: 1 })],
    ])
    const songs = await jellyfin.getUserTopSongs('u2', 5, '2026-01-01')
    expect(body(f.mock.calls[0][1])).toEqual({ userId: 'u2', minDate: '2026-01-01', limit: 5 })
    expect(songs[0]).toMatchObject({ Id: 's1', periodPlayCount: 3 })
  })

  it('surfaces API errors instead of falling back', async () => {
    const f = mockFetchRouter([[`${API}/playlists/p1/name`, jsonRes({ error: 'forbidden' }, 403)]])
    await expect(jellyfin.renamePlaylist('p1', 'New')).rejects.toThrow('forbidden')
    expect(f).toHaveBeenCalledTimes(1)
  })

  it.each([404, 503])('falls back to Jellyfin when the API answers %i', async status => {
    const f = mockFetchRouter([
      [`${API}/playlists/p1/name`, jsonRes({ error: 'x' }, status)],
      ['/Users/u1/Items/p1', jsonRes({ Id: 'p1', Name: 'Old' })],
      ['/Items/p1', emptyRes(204)],
    ])
    await jellyfin.renamePlaylist('p1', 'New')
    expect(body(f.mock.calls[2][1]).Name).toBe('New')
  })
})

describe('direct Jellyfin fallback when the API is not configured', () => {
  it('renamePlaylist re-posts the item', async () => {
    const f = mockFetchRouter([
      ['/Users/u1/Items/p1', jsonRes({ Id: 'p1', Name: 'Old' })],
      ['/Items/p1', emptyRes(204)],
    ])
    await jellyfin.renamePlaylist('p1', 'New')
    expect(body(f.mock.calls[1][1]).Name).toBe('New')
  })

  it('setPlaylistImage posts to /Images/Primary', async () => {
    const f = mockFetchRouter([['/Items/p1/Images/Primary', emptyRes(204)]])
    await jellyfin.setPlaylistImage('p1', new Blob(['abc']))
    expect(f.mock.calls[0][1]?.body).toBe(btoa('abc'))
  })

  it('top-items stats use the Playback Reporting plugin', async () => {
    const f = mockFetchRouter([
      ['/user_usage_stats/submit_custom_query', jsonRes({ results: [] })],
    ])
    await jellyfin.getUserTopSongs('u2', 5, '2026-01-01')
    expect(f.mock.calls[0][0]).toContain('submit_custom_query')
  })
})
