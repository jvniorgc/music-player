import { describe, it, expect, beforeEach, vi } from 'vitest'
import { jellyfin } from './jellyfin'
import { jsonRes, emptyRes, textRes, mockFetchRouter } from '@test/http'

const AUTH = {
  serverUrl: 'http://jf.local',
  token: 'TKN',
  userId: 'u1',
  username: 'me',
  serverId: 's1',
}

beforeEach(() => {
  jellyfin.setAuth({ ...AUTH })
})

describe('authenticate', () => {
  it('posts credentials, strips trailing slashes, and stores the session', async () => {
    const fetchMock = mockFetchRouter([
      ['/Users/AuthenticateByName', jsonRes({ AccessToken: 'TKN', User: { Id: 'u1', Name: 'me' }, ServerId: 's1' })],
    ])
    const auth = await jellyfin.authenticate('http://jf.local///', 'me', 'pw')

    expect(auth).toEqual(AUTH)
    expect(jellyfin.isAuthenticated).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://jf.local/Users/AuthenticateByName')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toEqual({ Username: 'me', Pw: 'pw' })
  })

  it('throws "Invalid credentials" on 401', async () => {
    mockFetchRouter([['AuthenticateByName', emptyRes(401)]])
    await expect(jellyfin.authenticate('http://jf.local', 'me', 'bad')).rejects.toThrow('Invalid credentials')
  })

  it('throws a generic connection error on other failures', async () => {
    mockFetchRouter([['AuthenticateByName', emptyRes(500)]])
    await expect(jellyfin.authenticate('http://jf.local', 'me', 'pw')).rejects.toThrow('Error connecting: 500')
  })
})

describe('auth state', () => {
  it('exposes getters and clears auth', () => {
    expect(jellyfin.serverUrl).toBe('http://jf.local')
    expect(jellyfin.userId).toBe('u1')
    expect(jellyfin.token).toBe('TKN')
    expect(jellyfin.serverId).toBe('s1')
    jellyfin.clearAuth()
    expect(jellyfin.isAuthenticated).toBe(false)
    expect(jellyfin.serverUrl).toBe('')
  })

  it('rejects requests when not authenticated', async () => {
    jellyfin.clearAuth()
    await expect(jellyfin.getAlbums()).rejects.toThrow('Not authenticated')
  })
})

describe('testConnection', () => {
  it('returns true when the public info endpoint is reachable', async () => {
    mockFetchRouter([['/System/Info/Public', emptyRes(200)]])
    expect(await jellyfin.testConnection('http://jf.local/')).toBe(true)
  })

  it('returns false when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    expect(await jellyfin.testConnection('http://jf.local')).toBe(false)
  })
})

describe('library sanitization & filtering', () => {
  it('getAlbums drops items with blank names but keeps the total count', async () => {
    const fetchMock = mockFetchRouter([
      ['IncludeItemTypes=MusicAlbum', jsonRes({
        Items: [
          { Id: 'a1', Name: 'Real', Type: 'MusicAlbum' },
          { Id: 'a2', Name: '   ', Type: 'MusicAlbum' },
          { Id: 'a3', Name: '', Type: 'MusicAlbum' },
        ],
        TotalRecordCount: 3,
      })],
    ])
    const res = await jellyfin.getAlbums()
    expect(res.Items.map(i => i.Id)).toEqual(['a1'])
    expect(res.TotalRecordCount).toBe(3)
    expect(fetchMock.mock.calls[0][0]).toContain('/Users/u1/Items')
  })

  it('getPlaylists filters out file-based m3u/m3u8 playlists', async () => {
    mockFetchRouter([
      ['IncludeItemTypes=Playlist', jsonRes({
        Items: [
          { Id: 'p1', Name: 'Keep', Type: 'Playlist', Path: '/data/keep' },
          { Id: 'p2', Name: 'Drop', Type: 'Playlist', Path: '/data/list.m3u' },
          { Id: 'p3', Name: 'Drop8', Type: 'Playlist', Path: '/data/list.m3u8' },
        ],
        TotalRecordCount: 3,
      })],
    ])
    const res = await jellyfin.getPlaylists()
    expect(res.Items.map(i => i.Id)).toEqual(['p1'])
    expect(res.TotalRecordCount).toBe(1)
  })
})

describe('search', () => {
  it('runs three parallel queries and returns grouped, sanitized results', async () => {
    mockFetchRouter([
      ['IncludeItemTypes=MusicAlbum', jsonRes({ Items: [{ Id: 'al', Name: 'Album' }], TotalRecordCount: 1 })],
      ['/Artists?', jsonRes({ Items: [{ Id: 'ar', Name: 'Artist' }, { Id: 'x', Name: '' }], TotalRecordCount: 2 })],
      ['IncludeItemTypes=Audio', jsonRes({ Items: [{ Id: 'so', Name: 'Song' }], TotalRecordCount: 1 })],
    ])
    const res = await jellyfin.search('q')
    expect(res.albums.map(i => i.Id)).toEqual(['al'])
    expect(res.artists.map(i => i.Id)).toEqual(['ar'])
    expect(res.songs.map(i => i.Id)).toEqual(['so'])
  })
})

describe('toggleFavorite', () => {
  it('DELETEs when already favorited and POSTs when not', async () => {
    const fetchMock = mockFetchRouter([['/FavoriteItems/', emptyRes(200)]])
    await jellyfin.toggleFavorite('it1', true)
    await jellyfin.toggleFavorite('it1', false)
    expect(fetchMock.mock.calls[0][1]?.method).toBe('DELETE')
    expect(fetchMock.mock.calls[1][1]?.method).toBe('POST')
    expect(fetchMock.mock.calls[0][0]).toContain('/Users/u1/FavoriteItems/it1')
  })
})

describe('URL builders', () => {
  it('builds stream, image, download and user-image URLs from auth', () => {
    expect(jellyfin.getStreamUrl('it1')).toBe('http://jf.local/Audio/it1/stream?api_key=TKN&static=true')
    expect(jellyfin.getDownloadUrl('it1')).toBe('http://jf.local/Items/it1/Download?api_key=TKN')
    expect(jellyfin.getImageUrl('it1')).toBe(
      'http://jf.local/Items/it1/Images/Primary?maxHeight=300&maxWidth=300&quality=90&api_key=TKN',
    )
    expect(jellyfin.getImageUrl('it1', 'TAG', 512)).toBe(
      'http://jf.local/Items/it1/Images/Primary?maxHeight=512&maxWidth=512&tag=TAG&quality=90&api_key=TKN',
    )
    expect(jellyfin.getUserImageUrl('u9', 'PT')).toBe(
      'http://jf.local/Users/u9/Images/Primary?maxHeight=200&maxWidth=200&tag=PT&quality=90&api_key=TKN',
    )
  })
})

describe('getLyrics', () => {
  it('returns Jellyfin embedded lyrics when present (no LRCLIB call)', async () => {
    const fetchMock = mockFetchRouter([
      ['/Audio/it1/Lyrics', jsonRes({ Lyrics: [{ Text: 'hi', Start: 0 }] })],
    ])
    const lines = await jellyfin.getLyrics('it1')
    expect(lines).toEqual([{ Text: 'hi', Start: 0 }])
    expect(fetchMock.mock.calls.every(c => !String(c[0]).includes('lrclib'))).toBe(true)
  })

  it('falls back to LRCLIB synced lyrics and parses LRC timestamps to ticks', async () => {
    mockFetchRouter([
      ['/Audio/it1/Lyrics', emptyRes(404)],
      ['/Users/u1/Items/it1', jsonRes({ Id: 'it1', Name: 'Track', Artists: ['Artist'], Album: 'Album' })],
      ['lrclib.net', jsonRes({ syncedLyrics: '[00:01.00] line one\n[00:02.50] line two' })],
    ])
    const lines = await jellyfin.getLyrics('it1')
    expect(lines).toEqual([
      { Text: 'line one', Start: 10_000_000 },
      { Text: 'line two', Start: 25_000_000 },
    ])
  })

  it('falls back to plain LRCLIB lyrics, dropping blank lines', async () => {
    mockFetchRouter([
      ['/Audio/it1/Lyrics', emptyRes(404)],
      ['/Users/u1/Items/it1', jsonRes({ Id: 'it1', Name: 'Track', AlbumArtist: 'Artist' })],
      ['lrclib.net', jsonRes({ plainLyrics: 'a\n\nb' })],
    ])
    expect(await jellyfin.getLyrics('it1')).toEqual([{ Text: 'a' }, { Text: 'b' }])
  })

  it('returns [] when the track lacks artist/title metadata', async () => {
    mockFetchRouter([
      ['/Audio/it1/Lyrics', emptyRes(404)],
      ['/Users/u1/Items/it1', jsonRes({ Id: 'it1', Name: 'Track' })],
    ])
    expect(await jellyfin.getLyrics('it1')).toEqual([])
  })
})

describe('getLyricsWithCache', () => {
  it('returns persisted downloaded lyrics without any network call', async () => {
    vi.mocked(window.api.getDownloadedLyrics).mockResolvedValue(JSON.stringify([{ Text: 'dl' }]))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await jellyfin.getLyricsWithCache('it1')).toEqual([{ Text: 'dl' }])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns session-cached lyrics when no downloaded copy exists', async () => {
    vi.mocked(window.api.getCachedLyrics).mockResolvedValue(JSON.stringify([{ Text: 'cached' }]))
    expect(await jellyfin.getLyricsWithCache('it1')).toEqual([{ Text: 'cached' }])
  })

  it('fetches and writes the session cache on a miss', async () => {
    mockFetchRouter([['/Audio/it1/Lyrics', jsonRes({ Lyrics: [{ Text: 'fresh', Start: 0 }] })]])
    const lines = await jellyfin.getLyricsWithCache('it1')
    expect(lines).toEqual([{ Text: 'fresh', Start: 0 }])
    expect(window.api.saveLyrics).toHaveBeenCalledWith('it1', JSON.stringify(lines))
  })

  it('still fetches when the cache lookups and the cache write all throw', async () => {
    vi.mocked(window.api.getDownloadedLyrics).mockRejectedValue(new Error('no offline'))
    vi.mocked(window.api.getCachedLyrics).mockRejectedValue(new Error('no cache'))
    vi.mocked(window.api.saveLyrics).mockRejectedValue(new Error('write failed'))
    mockFetchRouter([['/Audio/it1/Lyrics', jsonRes({ Lyrics: [{ Text: 'net', Start: 0 }] })]])
    expect(await jellyfin.getLyricsWithCache('it1')).toEqual([{ Text: 'net', Start: 0 }])
  })
})

describe('renameItem', () => {
  it('reads the full item, mutates the name and POSTs it back', async () => {
    const fetchMock = mockFetchRouter([
      ['/Users/u1/Items/it1', jsonRes({ Id: 'it1', Name: 'Old', Tags: [] })],
      ['/Items/it1', emptyRes(200)],
    ])
    await jellyfin.renameItem('it1', 'New')
    const post = fetchMock.mock.calls.find(c => c[1]?.method === 'POST')!
    expect(JSON.parse(post[1]?.body as string).Name).toBe('New')
  })
})
