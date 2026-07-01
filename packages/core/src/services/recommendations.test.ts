import { describe, it, expect, beforeEach, vi } from 'vitest'
import { jellyfin, JellyfinItem } from './jellyfin'
import { getRecommendations } from './recommendations'

const AUTH = { serverUrl: 'http://jf.local', token: 'TKN', userId: 'u1', username: 'me', serverId: 's1' }

const song = (Id: string, Name: string, artist: string): JellyfinItem =>
  ({ Id, Name, Type: 'Audio', Artists: [artist] })

beforeEach(() => {
  jellyfin.setAuth({ ...AUTH })
})

function configured() {
  vi.mocked(window.api.lastfmGetStatus).mockResolvedValue({ configured: true, connected: false, enabled: false, username: null })
}

describe('getRecommendations — variant A (Last.fm)', () => {
  it('seeds from the last month, expands to similar artists, and pulls owned songs', async () => {
    configured()
    vi.spyOn(jellyfin, 'getUserTopSongs').mockResolvedValue([
      song('seed1', 'Reckoner', 'Radiohead'),
      { Id: 'seed2', Name: '', Type: 'Audio' }, // no artist/name -> skipped seed
    ])
    vi.mocked(window.api.lastfmGetSimilarTracks).mockResolvedValue([
      { artist: 'Björk', track: 'Jóga', match: 0.9 },
      { artist: 'Portishead', track: 'Roads', match: 0.8 },
    ])
    const byArtist = vi.spyOn(jellyfin, 'getSongsByArtist').mockImplementation(async (name: string) => {
      if (name === 'Björk') return [song('b1', 'Jóga', 'Björk')]
      if (name === 'Portishead') return [song('p1', 'Roads', 'Portishead')]
      return []
    })
    const instantMix = vi.spyOn(jellyfin, 'getInstantMix')

    const out = await getRecommendations()

    expect(out.map(i => i.Id)).toEqual(['b1', 'p1']) // ordered by aggregate similarity
    expect(window.api.lastfmGetSimilarTracks).toHaveBeenCalledTimes(1) // only the valid seed
    expect(window.api.lastfmGetSimilarTracks).toHaveBeenCalledWith({ artist: 'Radiohead', track: 'Reckoner' }, 30)
    expect(byArtist).toHaveBeenCalledWith('Björk', 3)
    expect(instantMix).not.toHaveBeenCalled()
  })

  it('aggregates similar-artist scores across seeds and honours the limit', async () => {
    configured()
    vi.spyOn(jellyfin, 'getUserTopSongs').mockResolvedValue([
      song('seed1', 'Reckoner', 'Radiohead'),
      song('seed2', 'Idioteque', 'Thom Yorke'),
    ])
    vi.mocked(window.api.lastfmGetSimilarTracks).mockImplementation(async ({ track }) =>
      track === 'Reckoner'
        ? [{ artist: 'Björk', track: 'Jóga', match: 0.3 }, { artist: 'Aphex Twin', track: 'Xtal', match: 0.9 }]
        : [{ artist: 'Björk', track: 'Hyperballad', match: 0.5 }], // Björk again -> 0.3 + 0.5 = 0.8
    )
    vi.spyOn(jellyfin, 'getSongsByArtist').mockImplementation(async (name: string) =>
      name === 'Björk' ? [song('bk', 'Jóga', 'Björk')] : [song('ap', 'Xtal', 'Aphex Twin')],
    )

    const out = await getRecommendations(1)

    // Aphex Twin (0.9) outranks the summed Björk score (0.8); capped at limit 1.
    expect(out.map(i => i.Id)).toEqual(['ap'])
  })

  it('deduplicates a song returned for more than one candidate artist', async () => {
    configured()
    vi.spyOn(jellyfin, 'getUserTopSongs').mockResolvedValue([song('seed1', 'Reckoner', 'Radiohead')])
    vi.mocked(window.api.lastfmGetSimilarTracks).mockResolvedValue([
      { artist: 'Björk', track: 'Jóga', match: 0.9 },
      { artist: 'PJ Harvey', track: 'Down by the Water', match: 0.8 },
    ])
    // A collaboration surfaces under both artists but must appear only once.
    vi.spyOn(jellyfin, 'getSongsByArtist').mockResolvedValue([song('dup', 'Duet', 'Björk')])

    const out = await getRecommendations(5)

    expect(out.map(i => i.Id)).toEqual(['dup'])
  })

  it('falls back to InstantMix when no candidate artist has owned songs', async () => {
    configured()
    vi.spyOn(jellyfin, 'getUserTopSongs').mockResolvedValue([song('seed1', 'Reckoner', 'Radiohead')])
    vi.mocked(window.api.lastfmGetSimilarTracks).mockResolvedValue([{ artist: 'X', track: 'Y', match: 0.5 }])
    vi.spyOn(jellyfin, 'getSongsByArtist').mockResolvedValue([]) // user owns nothing by similar artists
    const instantMix = vi.spyOn(jellyfin, 'getInstantMix').mockResolvedValue({
      Items: [song('M1', 'Mix', 'Someone')], TotalRecordCount: 1,
    })

    const out = await getRecommendations()

    expect(out.map(i => i.Id)).toEqual(['M1'])
    expect(instantMix).toHaveBeenCalledWith('seed1', 50)
  })

  it('treats a Last.fm getSimilar failure as no candidates', async () => {
    configured()
    vi.spyOn(jellyfin, 'getUserTopSongs').mockResolvedValue([song('seed1', 'Reckoner', 'Radiohead')])
    vi.mocked(window.api.lastfmGetSimilarTracks).mockRejectedValue(new Error('boom'))
    const instantMix = vi.spyOn(jellyfin, 'getInstantMix').mockResolvedValue({
      Items: [song('M1', 'Mix', 'Someone')], TotalRecordCount: 1,
    })

    const out = await getRecommendations()

    expect(out.map(i => i.Id)).toEqual(['M1'])
    expect(instantMix).toHaveBeenCalled()
  })

  it('spreads artists to the front and caps same-artist runs before backfilling', async () => {
    configured()
    vi.spyOn(jellyfin, 'getUserTopSongs').mockResolvedValue([song('seed1', 'Reckoner', 'Radiohead')])
    vi.mocked(window.api.lastfmGetSimilarTracks).mockResolvedValue([
      { artist: 'Alpha', track: 't', match: 0.99 },
      { artist: 'Beta', track: 't', match: 0.50 },
      { artist: 'Gamma', track: 't', match: 0.40 },
      { artist: '', track: 'anon', match: 0.30 }, // blank artist -> ignored
    ])
    vi.spyOn(jellyfin, 'getSongsByArtist').mockImplementation(async (name: string) => {
      if (name === 'Alpha') return [song('a1', 'A1', 'Alpha'), song('a2', 'A2', 'Alpha'), song('a3', 'A3', 'Alpha'), song('a4', 'A4', 'Alpha')]
      if (name === 'Beta') return [song('b1', 'B1', 'Beta')]
      if (name === 'Gamma') return [song('g1', 'G1', 'Gamma')]
      return []
    })

    const out = await getRecommendations()

    // Round-robin across artists interleaves Alpha/Beta/Gamma at the head; the
    // per-artist cap (3) holds the 4th Alpha track as backfill at the tail.
    expect(out.map(i => i.Id)).toEqual(['a1', 'b1', 'g1', 'a2', 'a3', 'a4'])
    expect(new Set(out.slice(0, 3).map(i => i.Artists![0])).size).toBe(3)
  })

  it('diversifies seeds so a dominant artist does not consume every seed', async () => {
    configured()
    vi.spyOn(jellyfin, 'getUserTopSongs').mockResolvedValue([
      song('s1', 'T1', 'Radiohead'),
      song('s2', 'T2', 'Radiohead'),
      song('s3', 'T3', 'Radiohead'), // dropped: 3rd Radiohead seed exceeds the per-artist cap
      song('s4', 'T4', 'Björk'),
    ])
    const similar = vi.mocked(window.api.lastfmGetSimilarTracks).mockResolvedValue([])
    vi.spyOn(jellyfin, 'getInstantMix').mockResolvedValue({ Items: [song('M1', 'Mix', 'X')], TotalRecordCount: 1 })

    await getRecommendations()

    const seedTracks = similar.mock.calls.map(c => c[0].track)
    expect(seedTracks).toEqual(['T1', 'T2', 'T4'])
    expect(seedTracks).not.toContain('T3')
  })
})

describe('getRecommendations — variant B (fallback)', () => {
  it('uses InstantMix directly when Last.fm is not configured', async () => {
    vi.spyOn(jellyfin, 'getUserTopSongs').mockResolvedValue([song('seed1', 'Reckoner', 'Radiohead')])
    const similar = vi.mocked(window.api.lastfmGetSimilarTracks)
    const instantMix = vi.spyOn(jellyfin, 'getInstantMix').mockResolvedValue({
      Items: [song('M1', 'Mix', 'Someone')], TotalRecordCount: 1,
    })

    const out = await getRecommendations()

    expect(out.map(i => i.Id)).toEqual(['M1'])
    expect(similar).not.toHaveBeenCalled()
    expect(instantMix).toHaveBeenCalledWith('seed1', 50)
  })

  it('treats a Last.fm status failure as not configured', async () => {
    vi.mocked(window.api.lastfmGetStatus).mockRejectedValue(new Error('offline'))
    vi.spyOn(jellyfin, 'getUserTopSongs').mockResolvedValue([song('seed1', 'Reckoner', 'Radiohead')])
    const instantMix = vi.spyOn(jellyfin, 'getInstantMix').mockResolvedValue({
      Items: [song('M1', 'Mix', 'Someone')], TotalRecordCount: 1,
    })

    const out = await getRecommendations()
    expect(out.map(i => i.Id)).toEqual(['M1'])
    expect(instantMix).toHaveBeenCalled()
  })

  it('blends InstantMix across several seeds, dedupes, and caps repeat artists', async () => {
    // Not configured -> variant B. Seed s1's mix is dominated by one artist while
    // s2 contributes a different artist; the blend must surface variety.
    vi.spyOn(jellyfin, 'getUserTopSongs').mockResolvedValue([
      song('s1', 'One', 'Alpha'),
      song('s2', 'Two', 'Beta'),
    ])
    vi.spyOn(jellyfin, 'getInstantMix').mockImplementation(async (id: string) =>
      id === 's1'
        ? { Items: [song('a1', 'A1', 'Alpha'), song('a2', 'A2', 'Alpha'), song('a3', 'A3', 'Alpha')], TotalRecordCount: 3 }
        : { Items: [song('b1', 'B1', 'Beta'), song('a1', 'A1', 'Alpha')], TotalRecordCount: 2 }, // a1 duplicated across seeds
    )

    const out = await getRecommendations()

    // Round-robin across seeds pulls Beta up to 2nd place, the duplicate a1 is
    // dropped, and the per-artist cap (2) pushes the 3rd Alpha track to the tail.
    expect(out.map(i => i.Id)).toEqual(['a1', 'b1', 'a2', 'a3'])
    expect(new Set(out.slice(0, 2).map(i => i.Artists![0])).size).toBe(2)
  })

  it('skips ineligible seeds and blends from the eligible ones', async () => {
    vi.spyOn(jellyfin, 'getUserTopSongs').mockResolvedValue([
      song('seedA', 'A', 'AA'),
      song('seedB', 'B', 'BB'),
    ])
    const instantMix = vi.spyOn(jellyfin, 'getInstantMix')
      .mockRejectedValueOnce(new Error('no mix for seedA'))
      .mockResolvedValueOnce({ Items: [song('M1', 'Mix', 'Someone')], TotalRecordCount: 1 })

    const out = await getRecommendations()

    expect(out.map(i => i.Id)).toEqual(['M1'])
    expect(instantMix).toHaveBeenCalledTimes(2)
  })

  it('falls back to a random sample when no seed produces a mix', async () => {
    vi.spyOn(jellyfin, 'getUserTopSongs').mockResolvedValue([song('seedA', 'A', 'AA')])
    vi.spyOn(jellyfin, 'getInstantMix').mockResolvedValue({ Items: [], TotalRecordCount: 0 })
    const random = vi.spyOn(jellyfin, 'getRandomSongs').mockResolvedValue({
      Items: [song('R1', 'Rnd', 'Someone')], TotalRecordCount: 1,
    })

    const out = await getRecommendations()

    expect(out.map(i => i.Id)).toEqual(['R1'])
    expect(random).toHaveBeenCalledWith(50)
  })

  it('falls back to all-time seeds when the last month is empty', async () => {
    const top = vi.spyOn(jellyfin, 'getUserTopSongs')
      .mockResolvedValueOnce([])                                   // last-month query: empty
      .mockResolvedValueOnce([song('seedAll', 'Old', 'Legend')])  // all-time query
    const instantMix = vi.spyOn(jellyfin, 'getInstantMix').mockResolvedValue({
      Items: [song('M1', 'Mix', 'Someone')], TotalRecordCount: 1,
    })

    const out = await getRecommendations()

    expect(out.map(i => i.Id)).toEqual(['M1'])
    expect(top).toHaveBeenCalledTimes(2)
    expect(top.mock.calls[0][2]).toMatch(/^\d{4}-\d{2}-\d{2}$/) // minDate on the first call
    expect(top.mock.calls[1][2]).toBeUndefined()                // no minDate on the fallback
    expect(instantMix).toHaveBeenCalledWith('seedAll', 50)
  })

  it('uses a random sample when there is no user session', async () => {
    jellyfin.clearAuth()
    const top = vi.spyOn(jellyfin, 'getUserTopSongs')
    const random = vi.spyOn(jellyfin, 'getRandomSongs').mockResolvedValue({
      Items: [song('R1', 'Rnd', 'Someone')], TotalRecordCount: 1,
    })

    const out = await getRecommendations()

    expect(out.map(i => i.Id)).toEqual(['R1'])
    expect(top).not.toHaveBeenCalled()
    expect(random).toHaveBeenCalled()
  })
})
