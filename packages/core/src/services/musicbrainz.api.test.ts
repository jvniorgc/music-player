import { describe, it, expect, vi } from 'vitest'
import {
  searchReleases,
  getReleaseDetails,
  hasCoverArt,
  searchArtists,
  getArtistDetails,
  getArtistImageUrl,
  getArtistImageFromWikidata,
  type MBArtist,
} from './musicbrainz'
import { jsonRes, emptyRes, mockFetchRouter } from '@test/http'

describe('release search & details', () => {
  it('searchReleases builds a lucene query and returns releases', async () => {
    const fetchMock = mockFetchRouter([
      ['/release?query=', jsonRes({ releases: [{ id: 'r1', title: 'Album' }], count: 1 })],
    ])
    const releases = await searchReleases('Album', 'Artist')
    expect(releases).toHaveLength(1)
    const url = String(fetchMock.mock.calls[0][0])
    expect(decodeURIComponent(url)).toContain('release:"Album" AND artist:"Artist"')
  })

  it('searchReleases returns [] when the response has no releases', async () => {
    mockFetchRouter([['/release?query=', jsonRes({ count: 0 })]])
    expect(await searchReleases('X')).toEqual([])
  })

  it('getReleaseDetails throws on a non-ok MusicBrainz response', async () => {
    mockFetchRouter([['/release/r1', emptyRes(503)]])
    await expect(getReleaseDetails('r1')).rejects.toThrow('MusicBrainz error: 503')
  })
})

describe('hasCoverArt', () => {
  it('returns true when the Cover Art Archive responds ok', async () => {
    mockFetchRouter([['coverartarchive.org/release/r1', emptyRes(200)]])
    expect(await hasCoverArt('r1')).toBe(true)
  })

  it('returns false on a non-ok response', async () => {
    mockFetchRouter([['coverartarchive.org/release/r1', emptyRes(404)]])
    expect(await hasCoverArt('r1')).toBe(false)
  })

  it('returns false when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net')))
    expect(await hasCoverArt('r1')).toBe(false)
  })
})

describe('artist search & details', () => {
  it('searchArtists returns the artist list', async () => {
    mockFetchRouter([['/artist?query=', jsonRes({ artists: [{ id: 'a1', name: 'A' }], count: 1 })]])
    expect((await searchArtists('A'))[0].id).toBe('a1')
  })

  it('getArtistDetails fetches inc=url-rels+tags', async () => {
    const fetchMock = mockFetchRouter([['/artist/a1', jsonRes({ id: 'a1', name: 'A' })]])
    await getArtistDetails('a1')
    expect(String(fetchMock.mock.calls[0][0])).toContain('inc=url-rels+tags')
  })
})

describe('getArtistImageUrl (TheAudioDB)', () => {
  it('prefers the thumbnail field', async () => {
    mockFetchRouter([['theaudiodb.com', jsonRes({ artists: [{ strArtistThumb: 'thumb', strArtistFanart: 'fan' }] })]])
    expect(await getArtistImageUrl('mbid')).toBe('thumb')
  })

  it('returns null when no artist is found', async () => {
    mockFetchRouter([['theaudiodb.com', jsonRes({ artists: null })]])
    expect(await getArtistImageUrl('mbid')).toBeNull()
  })

  it('returns null on a non-ok response', async () => {
    mockFetchRouter([['theaudiodb.com', emptyRes(500)]])
    expect(await getArtistImageUrl('mbid')).toBeNull()
  })

  it('returns null when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net')))
    expect(await getArtistImageUrl('mbid')).toBeNull()
  })
})

describe('getArtistImageFromWikidata', () => {
  it('returns null when the artist has no relations', async () => {
    expect(await getArtistImageFromWikidata({ id: 'a', name: 'A' })).toBeNull()
  })

  it('resolves a Wikimedia thumbnail URL from a P18 claim', async () => {
    const artist: MBArtist = {
      id: 'a',
      name: 'A',
      relations: [{ type: 'wikidata', url: { resource: 'https://www.wikidata.org/wiki/Q42' } }],
    }
    mockFetchRouter([
      ['Special:EntityData/Q42.json', jsonRes({
        entities: { Q42: { claims: { P18: [{ mainsnak: { datavalue: { value: 'My Image.jpg' } } }] } } },
      })],
    ])
    const url = await getArtistImageFromWikidata(artist)
    expect(url).toContain('upload.wikimedia.org/wikipedia/commons/thumb/')
    expect(url).toContain('My_Image.jpg')
    expect(url).toContain('500px-My_Image.jpg')
  })

  it('returns null when the Wikidata entity has no image claim', async () => {
    const artist: MBArtist = {
      id: 'a',
      name: 'A',
      relations: [{ type: 'wikidata', url: { resource: 'https://www.wikidata.org/wiki/Q1' } }],
    }
    mockFetchRouter([['Special:EntityData/Q1.json', jsonRes({ entities: { Q1: { claims: {} } } })]])
    expect(await getArtistImageFromWikidata(artist)).toBeNull()
  })

  it('returns null when the Wikidata fetch throws', async () => {
    const artist: MBArtist = {
      id: 'a',
      name: 'A',
      relations: [{ type: 'wikidata', url: { resource: 'https://www.wikidata.org/wiki/Q2' } }],
    }
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net')))
    expect(await getArtistImageFromWikidata(artist)).toBeNull()
  })

  it('uses a real MD5 digest for the Wikimedia path when WebCrypto provides one', async () => {
    const artist: MBArtist = {
      id: 'a',
      name: 'A',
      relations: [{ type: 'wikidata', url: { resource: 'https://www.wikidata.org/wiki/Q9' } }],
    }
    const digestSpy = vi
      .spyOn(crypto.subtle, 'digest')
      .mockResolvedValue(new Uint8Array([0xab, 0xcd, 0x01]).buffer)
    mockFetchRouter([
      ['Special:EntityData/Q9.json', jsonRes({
        entities: { Q9: { claims: { P18: [{ mainsnak: { datavalue: { value: 'Pic.jpg' } } }] } } },
      })],
    ])
    const url = await getArtistImageFromWikidata(artist)
    expect(url).toContain('/a/ab/Pic.jpg/500px-Pic.jpg')
    digestSpy.mockRestore()
  })
})
