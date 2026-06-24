import { describe, it, expect, beforeEach, vi } from 'vitest'
import { jellyfin } from './jellyfin'
import { jsonRes, emptyRes, textRes, mockFetchRouter } from '@test/http'

const AUTH = { serverUrl: 'http://jf.local', token: 'TKN', userId: 'u1', username: 'me', serverId: 's1' }

beforeEach(() => {
  jellyfin.setAuth({ ...AUTH })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

const items = (...names: string[]) => ({
  Items: names.map((Name, i) => ({ Id: `i${i}`, Name, Type: 'Audio' })),
  TotalRecordCount: names.length,
})

describe('library getters', () => {
  it('getAlbums hits the album endpoint and drops blank-named items', async () => {
    const fetchMock = mockFetchRouter([['IncludeItemTypes=MusicAlbum', jsonRes({ Items: [{ Id: 'a', Name: 'Real' }, { Id: 'b', Name: '  ' }], TotalRecordCount: 2 })]])
    const res = await jellyfin.getAlbums()
    expect(res.Items).toEqual([{ Id: 'a', Name: 'Real' }])
    expect(res.TotalRecordCount).toBe(2)
    expect(fetchMock.mock.calls[0][0]).toContain('/Users/u1/Items?IncludeItemTypes=MusicAlbum')
  })

  it('getAlbumItems returns raw items for a parent album', async () => {
    mockFetchRouter([['ParentId=alb1', jsonRes(items('Track'))]])
    const res = await jellyfin.getAlbumItems('alb1')
    expect(res.Items).toHaveLength(1)
  })

  it('getArtists hits the Artists endpoint', async () => {
    const fetchMock = mockFetchRouter([['/Artists?', jsonRes(items('Artist'))]])
    await jellyfin.getArtists()
    expect(fetchMock.mock.calls[0][0]).toContain('UserId=u1')
  })

  it('getArtistAlbums filters by AlbumArtistIds', async () => {
    const fetchMock = mockFetchRouter([['AlbumArtistIds=ar1', jsonRes(items('Album'))]])
    await jellyfin.getArtistAlbums('ar1')
    expect(fetchMock.mock.calls[0][0]).toContain('AlbumArtistIds=ar1')
  })

  it('getSongs hits the audio endpoint', async () => {
    mockFetchRouter([['IncludeItemTypes=Audio', jsonRes(items('Song'))]])
    expect((await jellyfin.getSongs()).Items).toHaveLength(1)
  })

  it('getPlaylists drops file-based m3u playlists', async () => {
    mockFetchRouter([['IncludeItemTypes=Playlist', jsonRes({
      Items: [
        { Id: 'p1', Name: 'Keep', Path: '/data/p1' },
        { Id: 'p2', Name: 'Skip', Path: '/data/list.m3u' },
        { Id: 'p3', Name: 'Skip8', Path: '/data/list.m3u8' },
      ],
      TotalRecordCount: 3,
    })]])
    const res = await jellyfin.getPlaylists()
    expect(res.Items.map(i => i.Id)).toEqual(['p1'])
    expect(res.TotalRecordCount).toBe(1)
  })

  it('getPlaylistItems hits the playlist items endpoint', async () => {
    mockFetchRouter([['/Playlists/pl1/Items', jsonRes(items('Track'))]])
    expect((await jellyfin.getPlaylistItems('pl1')).Items).toHaveLength(1)
  })

  it('getRecentlyPlayed / getFrequentlyPlayed / getRecentlyAdded sanitize results', async () => {
    mockFetchRouter([['SortBy=DatePlayed', jsonRes(items('R'))]])
    expect((await jellyfin.getRecentlyPlayed()).Items).toHaveLength(1)
    mockFetchRouter([['SortBy=PlayCount', jsonRes(items('F'))]])
    expect((await jellyfin.getFrequentlyPlayed()).Items).toHaveLength(1)
    mockFetchRouter([['SortBy=DateCreated', jsonRes(items('A'))]])
    expect((await jellyfin.getRecentlyAdded()).Items).toHaveLength(1)
  })
})

describe('request error handling', () => {
  it('throws an API error with status and body on a non-ok response', async () => {
    mockFetchRouter([['/Users/u1/Items/x', textRes('boom', 500)]])
    await expect(jellyfin.getFullItem('x')).rejects.toThrow('API error: 500')
  })

  it('treats an empty 200 body as undefined (void endpoints)', async () => {
    mockFetchRouter([['FavoriteItems/fav', emptyRes(200)]])
    await expect(jellyfin.toggleFavorite('fav', false)).resolves.toBeUndefined()
  })
})

describe('favorites & playback reporting', () => {
  it('toggleFavorite POSTs to add and DELETEs to remove', async () => {
    let fetchMock = mockFetchRouter([['FavoriteItems/i1', emptyRes(204)]])
    await jellyfin.toggleFavorite('i1', false)
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')

    fetchMock = mockFetchRouter([['FavoriteItems/i1', emptyRes(204)]])
    await jellyfin.toggleFavorite('i1', true)
    expect(fetchMock.mock.calls[0][1]?.method).toBe('DELETE')
  })

  it('reportPlaybackStart and reportPlaybackStopped post session payloads', async () => {
    let fetchMock = mockFetchRouter([['/Sessions/Playing', emptyRes(204)]])
    await jellyfin.reportPlaybackStart('i1')
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({ ItemId: 'i1', CanSeek: true })

    fetchMock = mockFetchRouter([['/Sessions/Playing/Stopped', emptyRes(204)]])
    await jellyfin.reportPlaybackStopped('i1', 1234)
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({ ItemId: 'i1', PositionTicks: 1234 })
  })
})

describe('item & playlist CRUD', () => {
  it('createPlaylist posts and tags the owner', async () => {
    const fetchMock = mockFetchRouter([
      ['/Users/u1/Items/p1', () => jsonRes({ Id: 'p1', Tags: ['mp-owner:u1'] })],
      ['/Playlists', () => jsonRes({ Id: 'p1' })],
    ])
    const res = await jellyfin.createPlaylist('Mix', ['s1'])
    expect(res).toEqual({ Id: 'p1' })
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toMatchObject({ Name: 'Mix', Ids: ['s1'], UserId: 'u1', MediaType: 'Audio' })
  })

  it('deleteItem DELETEs the item', async () => {
    const fetchMock = mockFetchRouter([['/Items/i1', emptyRes(204)]])
    await jellyfin.deleteItem('i1')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('DELETE')
  })

  it('renameItem fetches then re-posts the item with a new name', async () => {
    const fetchMock = mockFetchRouter([
      ['/Users/u1/Items/i1', jsonRes({ Id: 'i1', Name: 'Old' })],
      ['/Items/i1', emptyRes(204)],
    ])
    await jellyfin.renameItem('i1', 'New')
    const postBody = JSON.parse(fetchMock.mock.calls[1][1]?.body as string)
    expect(postBody.Name).toBe('New')
  })

  it('updateItem merges updates onto the fetched item', async () => {
    const fetchMock = mockFetchRouter([
      ['/Users/u1/Items/i1', jsonRes({ Id: 'i1', Name: 'X', Year: 2000 })],
      ['/Items/i1', emptyRes(204)],
    ])
    await jellyfin.updateItem('i1', { Year: 2024 })
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toMatchObject({ Id: 'i1', Name: 'X', Year: 2024 })
  })

  it('deleteImage and refreshItem hit their endpoints', async () => {
    let fetchMock = mockFetchRouter([['/Items/i1/Images/Primary', emptyRes(204)]])
    await jellyfin.deleteImage('i1')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('DELETE')

    fetchMock = mockFetchRouter([['/Items/i1/Refresh', emptyRes(204)]])
    await jellyfin.refreshItem('i1')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
  })

  it('addToPlaylist, removeFromPlaylist, movePlaylistItem build the right URLs', async () => {
    let fetchMock = mockFetchRouter([['/Playlists/pl/Items?Ids=a,b', emptyRes(204)]])
    await jellyfin.addToPlaylist('pl', ['a', 'b'])
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')

    fetchMock = mockFetchRouter([['/Playlists/pl/Items?EntryIds=e1,e2', emptyRes(204)]])
    await jellyfin.removeFromPlaylist('pl', ['e1', 'e2'])
    expect(fetchMock.mock.calls[0][1]?.method).toBe('DELETE')

    fetchMock = mockFetchRouter([['/Playlists/pl/Items/i1/Move/3', emptyRes(204)]])
    await jellyfin.movePlaylistItem('pl', 'i1', 3)
    expect(fetchMock.mock.calls[0][0]).toContain('/Move/3')
  })
})

describe('users & images', () => {
  it('getUsers and getCurrentUser hit user endpoints', async () => {
    mockFetchRouter([['/Users', jsonRes([{ Id: 'u1', Name: 'me' }])]])
    expect(await jellyfin.getUsers()).toHaveLength(1)
    mockFetchRouter([['/Users/u1', jsonRes({ Id: 'u1', Name: 'me' })]])
    expect((await jellyfin.getCurrentUser()).Name).toBe('me')
  })

  it('updateUserName fetches the user then posts a renamed copy', async () => {
    const fetchMock = mockFetchRouter([['/Users/u1', (url, init) => init?.method === 'POST' ? emptyRes(204) : jsonRes({ Id: 'u1', Name: 'old' })]])
    await jellyfin.updateUserName('newname')
    const post = fetchMock.mock.calls.find(c => c[1]?.method === 'POST')!
    expect(JSON.parse(post[1]?.body as string).Name).toBe('newname')
  })

  it('getUserImageUrl builds a primary-image url with the api key', () => {
    expect(jellyfin.getUserImageUrl('u9', 'TAG', 64)).toBe('http://jf.local/Users/u9/Images/Primary?maxHeight=64&maxWidth=64&tag=TAG&quality=90&api_key=TKN')
    expect(jellyfin.getUserImageUrl('u9')).toContain('maxHeight=200')
  })

  it('uploadImageBlob base64-encodes and posts the bytes', async () => {
    const fetchMock = mockFetchRouter([['/Items/i1/Images/Primary', emptyRes(200)]])
    await jellyfin.uploadImageBlob('i1', new Blob(['abc']))
    const init = fetchMock.mock.calls[0][1]!
    expect(init.method).toBe('POST')
    expect(init.body).toBe(btoa('abc'))
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('image/jpeg')
  })

  it('uploadImage downloads the source then uploads the blob', async () => {
    const fetchMock = mockFetchRouter([
      ['http://img/cover.jpg', () => textRes('xyz')],
      ['/Items/i1/Images/Primary', () => emptyRes(200)],
    ])
    await jellyfin.uploadImage('i1', 'http://img/cover.jpg')
    expect(fetchMock.mock.calls.some(c => String(c[0]).includes('/Items/i1/Images/Primary'))).toBe(true)
  })

  it('uploadImage throws when the source fetch fails', async () => {
    mockFetchRouter([['http://img/bad.jpg', emptyRes(404)]])
    await expect(jellyfin.uploadImage('i1', 'http://img/bad.jpg')).rejects.toThrow('Failed to fetch cover art: 404')
  })

  it('uploadUserImage posts to the user primary-image endpoint', async () => {
    const fetchMock = mockFetchRouter([['/Users/u1/Images/Primary', emptyRes(200)]])
    await jellyfin.uploadUserImage(new Blob(['q']))
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
  })
})

describe('getUserPlaylists', () => {
  it('returns only tagged playlists for another user', async () => {
    mockFetchRouter([['Path,Tags', jsonRes({
      Items: [
        { Id: 'a', Name: 'Shared', Tags: ['mp-owner:other'] },
        { Id: 'b', Name: 'NotOwned', Tags: [] },
        { Id: 'c', Name: '', Tags: ['mp-owner:other'] },
      ],
      TotalRecordCount: 3,
    })]])
    const res = await jellyfin.getUserPlaylists('other')
    expect(res.Items.map(i => i.Id)).toEqual(['a'])
  })

  it('auto-discovers untagged playlists owned by the logged-in user', async () => {
    mockFetchRouter([
      ['/Playlists/pl1/Users', () => emptyRes(200)],
      ['/Users/u1/Items/pl1', () => jsonRes({ Id: 'pl1', Tags: [] })],
      ['/Items/pl1', () => emptyRes(204)],
      ['Path,Tags', () => jsonRes({ Items: [{ Id: 'pl1', Name: 'Mine', Tags: [] }], TotalRecordCount: 1 })],
    ])
    const res = await jellyfin.getUserPlaylists('u1')
    expect(res.Items.map(i => i.Id)).toEqual(['pl1'])
  })
})

describe('listening stats', () => {
  it('getUserTopArtists (all-time) aggregates play counts by artist', async () => {
    mockFetchRouter([
      ['ArtistItems&Filters=IsPlayed', jsonRes({
        Items: [
          { Id: 's1', Name: 'A', AlbumArtists: [{ Id: 'ar1', Name: 'Band' }], UserData: { PlayCount: 3, IsFavorite: false } },
          { Id: 's2', Name: 'B', AlbumArtists: [{ Id: 'ar1', Name: 'Band' }], UserData: { PlayCount: 2, IsFavorite: false } },
        ],
        TotalRecordCount: 2,
      })],
      ['SongCount,AlbumCount', jsonRes({ Items: [{ Id: 'ar1', Name: 'Band' }], TotalRecordCount: 1 })],
    ])
    const res = await jellyfin.getUserTopArtists('u1')
    expect(res).toEqual([{ Id: 'ar1', Name: 'Band', periodPlayCount: 5 }])
  })

  it('getUserTopAlbums (all-time) aggregates play counts by album', async () => {
    mockFetchRouter([
      ['Fields=AlbumId,AlbumArtist,Album&Filters=IsPlayed', jsonRes({
        Items: [
          { Id: 's1', Name: 'A', AlbumId: 'al1', UserData: { PlayCount: 4, IsFavorite: false } },
          { Id: 's2', Name: 'B', AlbumId: 'al1', UserData: { PlayCount: 1, IsFavorite: false } },
        ],
        TotalRecordCount: 2,
      })],
      ['ProductionYear,AlbumArtist', jsonRes({ Items: [{ Id: 'al1', Name: 'Album' }], TotalRecordCount: 1 })],
    ])
    const res = await jellyfin.getUserTopAlbums('u1')
    expect(res).toEqual([{ Id: 'al1', Name: 'Album', periodPlayCount: 5 }])
  })

  it('getUserTopSongs (all-time) returns sanitized native results', async () => {
    mockFetchRouter([['Artists,HasLyrics&Filters=IsPlayed', jsonRes(items('Song'))]])
    expect(await jellyfin.getUserTopSongs('u1')).toHaveLength(1)
  })

  it('getUserTopSongs (period) queries the playback report plugin', async () => {
    mockFetchRouter([
      ['/user_usage_stats/submit_custom_query', jsonRes({ colums: [], results: [['s1', '5']], message: 'ok' })],
      ['Ids=s1', jsonRes({ Items: [{ Id: 's1', Name: 'Song' }], TotalRecordCount: 1 })],
    ])
    const res = await jellyfin.getUserTopSongs('u1', 20, '2024-01-01')
    expect(res).toEqual([{ Id: 's1', Name: 'Song', periodPlayCount: 5 }])
  })

  it('getUserTopSongs (period) returns empty when the plugin reports nothing', async () => {
    mockFetchRouter([['/user_usage_stats/submit_custom_query', jsonRes({ colums: [], results: [], message: 'ok' })]])
    expect(await jellyfin.getUserTopSongs('u1', 20, '2024-01-01')).toEqual([])
  })

  it('getUserTopArtists (period) aggregates plugin results by artist', async () => {
    mockFetchRouter([
      ['/user_usage_stats/submit_custom_query', jsonRes({ colums: [], results: [['s1', '3'], ['s4', '1'], ['s2', '2'], ['s3', '1']], message: 'ok' })],
      ['AlbumArtists,PrimaryImageAspectRatio', jsonRes({
        Items: [
          { Id: 's1', AlbumArtists: [{ Id: 'ar1', Name: 'Band' }] },
          { Id: 's4', AlbumArtists: [{ Id: 'ar1', Name: 'Band' }] }, // same artist -> merges play counts
          { Id: 's2', AlbumArtists: [{ Id: 'ar2', Name: 'Other' }] },
          { Id: 's3' }, // no artist entry -> skipped
          { Id: 'sX', AlbumArtists: [{ Id: 'ar9', Name: 'Ghost' }] }, // no matching play -> skipped
        ],
        TotalRecordCount: 5,
      })],
      ['SongCount,AlbumCount', jsonRes({ Items: [{ Id: 'ar1', Name: 'Band' }], TotalRecordCount: 1 })], // ar2 missing -> filtered
    ])
    const res = await jellyfin.getUserTopArtists('u1', 20, '2024-01-01')
    expect(res).toEqual([{ Id: 'ar1', Name: 'Band', periodPlayCount: 4 }])
  })

  it('getUserTopArtists (period) returns empty when the plugin reports nothing', async () => {
    mockFetchRouter([['/user_usage_stats/submit_custom_query', jsonRes({ colums: [], results: [], message: 'ok' })]])
    expect(await jellyfin.getUserTopArtists('u1', 20, '2024-01-01')).toEqual([])
  })

  it('getUserTopArtists (period) falls back to all-time when the plugin is unavailable', async () => {
    mockFetchRouter([
      ['/user_usage_stats/submit_custom_query', textRes('no plugin', 404)],
      ['ArtistItems&Filters=IsPlayed', jsonRes({
        Items: [{ Id: 's1', Name: 'A', AlbumArtists: [{ Id: 'ar1', Name: 'Band' }], UserData: { PlayCount: 4, IsFavorite: false } }],
        TotalRecordCount: 1,
      })],
      ['SongCount,AlbumCount', jsonRes({ Items: [{ Id: 'ar1', Name: 'Band' }], TotalRecordCount: 1 })],
    ])
    const res = await jellyfin.getUserTopArtists('u1', 20, '2024-01-01')
    expect(res).toEqual([{ Id: 'ar1', Name: 'Band', periodPlayCount: 4 }])
  })

  it('getUserTopAlbums (period) aggregates plugin results by album', async () => {
    mockFetchRouter([
      ['/user_usage_stats/submit_custom_query', jsonRes({ colums: [], results: [['s1', '4'], ['s2', '1'], ['s3', '2']], message: 'ok' })],
      ['Ids=s1,s2,s3&Fields=AlbumId,AlbumArtist,PrimaryImageAspectRatio', jsonRes({
        Items: [
          { Id: 's1', AlbumId: 'al1' },
          { Id: 's2', AlbumId: 'al1' },
          { Id: 's3' }, // no AlbumId -> skipped
        ],
        TotalRecordCount: 3,
      })],
      ['ProductionYear,AlbumArtist', jsonRes({ Items: [{ Id: 'al1', Name: 'Album' }], TotalRecordCount: 1 })],
    ])
    const res = await jellyfin.getUserTopAlbums('u1', 20, '2024-01-01')
    expect(res).toEqual([{ Id: 'al1', Name: 'Album', periodPlayCount: 5 }])
  })

  it('getUserTopAlbums (period) returns empty when the plugin reports nothing', async () => {
    mockFetchRouter([['/user_usage_stats/submit_custom_query', jsonRes({ colums: [], results: [], message: 'ok' })]])
    expect(await jellyfin.getUserTopAlbums('u1', 20, '2024-01-01')).toEqual([])
  })

  it('getUserTopAlbums (period) falls back to all-time when the plugin is unavailable', async () => {
    mockFetchRouter([
      ['/user_usage_stats/submit_custom_query', textRes('no plugin', 404)],
      ['Fields=AlbumId,AlbumArtist,Album&Filters=IsPlayed', jsonRes({
        Items: [{ Id: 's1', Name: 'A', AlbumId: 'al1', UserData: { PlayCount: 7, IsFavorite: false } }],
        TotalRecordCount: 1,
      })],
      ['ProductionYear,AlbumArtist', jsonRes({ Items: [{ Id: 'al1', Name: 'Album' }], TotalRecordCount: 1 })],
    ])
    const res = await jellyfin.getUserTopAlbums('u1', 20, '2024-01-01')
    expect(res).toEqual([{ Id: 'al1', Name: 'Album', periodPlayCount: 7 }])
  })

  it('getUserTopSongs (period) falls back to all-time when the plugin is unavailable', async () => {
    mockFetchRouter([
      ['/user_usage_stats/submit_custom_query', textRes('no plugin', 404)],
      ['Artists,HasLyrics&Filters=IsPlayed', jsonRes(items('Song'))],
    ])
    const res = await jellyfin.getUserTopSongs('u1', 20, '2024-01-01')
    expect(res).toHaveLength(1)
  })
})

describe('playlist ownership & misc error paths', () => {
  it('createPlaylist still resolves when owner-tagging fails', async () => {
    mockFetchRouter([
      ['/Playlists', () => jsonRes({ Id: 'p9' })],
      ['/Users/u1/Items/p9', () => textRes('nope', 500)], // setItemOwnerTag GET fails
    ])
    const res = await jellyfin.createPlaylist('Mix', ['s1'])
    expect(res).toEqual({ Id: 'p9' })
    expect(console.warn).toHaveBeenCalled()
  })

  it('getUserPlaylists skips items owned by others and survives a Users probe failure', async () => {
    mockFetchRouter([
      ['Path,Tags', () => jsonRes({
        Items: [
          { Id: 'pl2', Name: 'Other', Tags: ['mp-owner:bob'] }, // owned by someone else -> null
          { Id: 'pl3', Name: 'Net', Tags: [] },                  // probe throws -> null
        ],
        TotalRecordCount: 2,
      })],
      ['/Playlists/pl3/Users', () => { throw new Error('network down') }],
    ])
    const res = await jellyfin.getUserPlaylists('u1')
    expect(res.Items).toEqual([])
  })

  it('getLyrics returns [] when neither embedded nor LRCLIB lyrics exist', async () => {
    mockFetchRouter([
      ['/Audio/itemX/Lyrics', emptyRes(404)],
      ['/Users/u1/Items/itemX', jsonRes({ Id: 'itemX', Name: 'Track', Artists: ['Band'] })],
      ['lrclib.net/api/get', jsonRes({})],
    ])
    expect(await jellyfin.getLyrics('itemX')).toEqual([])
  })

  it('getLyrics returns [] when track metadata is incomplete', async () => {
    mockFetchRouter([
      ['/Audio/itemY/Lyrics', emptyRes(404)],
      ['/Users/u1/Items/itemY', jsonRes({ Id: 'itemY', Name: '', Artists: [] })],
    ])
    expect(await jellyfin.getLyrics('itemY')).toEqual([])
  })

  it('getLyrics splits plain LRCLIB lyrics into lines', async () => {
    mockFetchRouter([
      ['/Audio/itemZ/Lyrics', emptyRes(404)],
      ['/Users/u1/Items/itemZ', jsonRes({ Id: 'itemZ', Name: 'Track', Artists: ['Band'], Album: 'Disc' })],
      ['lrclib.net/api/get', jsonRes({ plainLyrics: 'line one\n\nline two' })],
    ])
    expect(await jellyfin.getLyrics('itemZ')).toEqual([{ Text: 'line one' }, { Text: 'line two' }])
  })
})
