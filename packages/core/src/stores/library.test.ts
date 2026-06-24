import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../services/jellyfin', () => ({
  jellyfin: {
    getAlbums: vi.fn(),
    getArtists: vi.fn(),
    getSongs: vi.fn(),
    getPlaylists: vi.fn(),
    getRecentlyAdded: vi.fn(),
    getRecentlyPlayed: vi.fn(),
  },
}))

import { useLibraryStore } from './library'
import { jellyfin } from '../services/jellyfin'

const INITIAL = {
  albums: [], artists: [], songs: [], playlists: [], recentlyAdded: [], recentlyPlayed: [],
  totalAlbums: 0, totalArtists: 0, totalSongs: 0, isLoading: false,
}

beforeEach(() => {
  useLibraryStore.setState(INITIAL)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('fetchAlbums', () => {
  it('replaces albums on the first page and records the total', async () => {
    vi.mocked(jellyfin.getAlbums).mockResolvedValue({ Items: [{ Id: 'a1', Name: 'A' }], TotalRecordCount: 1 })
    await useLibraryStore.getState().fetchAlbums(0)
    const s = useLibraryStore.getState()
    expect(s.albums.map(a => a.Id)).toEqual(['a1'])
    expect(s.totalAlbums).toBe(1)
    expect(s.isLoading).toBe(false)
  })

  it('appends albums when fetching a later page', async () => {
    useLibraryStore.setState({ albums: [{ Id: 'a0', Name: 'A0' }] })
    vi.mocked(jellyfin.getAlbums).mockResolvedValue({ Items: [{ Id: 'a1', Name: 'A1' }], TotalRecordCount: 2 })
    await useLibraryStore.getState().fetchAlbums(1)
    expect(useLibraryStore.getState().albums.map(a => a.Id)).toEqual(['a0', 'a1'])
  })

  it('stops loading and logs on error', async () => {
    vi.mocked(jellyfin.getAlbums).mockRejectedValue(new Error('boom'))
    await useLibraryStore.getState().fetchAlbums(0)
    expect(useLibraryStore.getState().isLoading).toBe(false)
  })
})

describe('paginated fetches', () => {
  it('fetchArtists fetches all remaining pages on the first load', async () => {
    vi.mocked(jellyfin.getArtists).mockImplementation(async (start = 0) => ({
      Items: [{ Id: `ar${start}`, Name: `Artist ${start}` }],
      TotalRecordCount: 150,
    }))
    await useLibraryStore.getState().fetchArtists(0)
    const s = useLibraryStore.getState()
    // First page (0) + one extra page (100).
    expect(s.artists.map(a => a.Id)).toEqual(['ar0', 'ar100'])
    expect(s.totalArtists).toBe(150)
  })

  it('fetchSongs paginates in 1000-item windows', async () => {
    vi.mocked(jellyfin.getSongs).mockImplementation(async (start = 0) => ({
      Items: [{ Id: `s${start}`, Name: `Song ${start}` }],
      TotalRecordCount: 1500,
    }))
    await useLibraryStore.getState().fetchSongs(0)
    expect(useLibraryStore.getState().songs.map(s => s.Id)).toEqual(['s0', 's1000'])
  })

  it('fetchArtists appends when fetching a later page', async () => {
    useLibraryStore.setState({ artists: [{ Id: 'ar0', Name: 'A0' }] })
    vi.mocked(jellyfin.getArtists).mockResolvedValue({ Items: [{ Id: 'ar1', Name: 'A1' }], TotalRecordCount: 200 })
    await useLibraryStore.getState().fetchArtists(100)
    expect(useLibraryStore.getState().artists.map(a => a.Id)).toEqual(['ar0', 'ar1'])
  })
})

describe('home, playlists & load-more guards', () => {
  it('fetchHome loads recently added and played in parallel', async () => {
    vi.mocked(jellyfin.getRecentlyAdded).mockResolvedValue({ Items: [{ Id: 'ra', Name: 'RA' }], TotalRecordCount: 1 })
    vi.mocked(jellyfin.getRecentlyPlayed).mockResolvedValue({ Items: [{ Id: 'rp', Name: 'RP' }], TotalRecordCount: 1 })
    await useLibraryStore.getState().fetchHome()
    const s = useLibraryStore.getState()
    expect(s.recentlyAdded[0].Id).toBe('ra')
    expect(s.recentlyPlayed[0].Id).toBe('rp')
  })

  it('fetchPlaylists stores playlists', async () => {
    vi.mocked(jellyfin.getPlaylists).mockResolvedValue({ Items: [{ Id: 'pl', Name: 'PL' }], TotalRecordCount: 1 })
    await useLibraryStore.getState().fetchPlaylists()
    expect(useLibraryStore.getState().playlists[0].Id).toBe('pl')
  })

  it('loadMoreAlbums does nothing once everything is loaded', async () => {
    useLibraryStore.setState({ albums: [{ Id: 'a1', Name: 'A' }], totalAlbums: 1 })
    await useLibraryStore.getState().loadMoreAlbums()
    expect(jellyfin.getAlbums).not.toHaveBeenCalled()
  })

  it('loadMoreSongs fetches the next window when more remain', async () => {
    useLibraryStore.setState({ songs: [{ Id: 's0', Name: 'S' }], totalSongs: 1500 })
    vi.mocked(jellyfin.getSongs).mockResolvedValue({ Items: [{ Id: 's1', Name: 'S1' }], TotalRecordCount: 1500 })
    await useLibraryStore.getState().loadMoreSongs()
    expect(jellyfin.getSongs).toHaveBeenCalled()
  })
})

describe('error handling', () => {
  it('fetchArtists stops loading and logs on error', async () => {
    vi.mocked(jellyfin.getArtists).mockRejectedValue(new Error('boom'))
    await useLibraryStore.getState().fetchArtists(0)
    expect(useLibraryStore.getState().isLoading).toBe(false)
    expect(console.error).toHaveBeenCalled()
  })

  it('fetchSongs stops loading and logs on error', async () => {
    vi.mocked(jellyfin.getSongs).mockRejectedValue(new Error('boom'))
    await useLibraryStore.getState().fetchSongs(0)
    expect(useLibraryStore.getState().isLoading).toBe(false)
    expect(console.error).toHaveBeenCalled()
  })

  it('fetchPlaylists logs on error without throwing', async () => {
    vi.mocked(jellyfin.getPlaylists).mockRejectedValue(new Error('boom'))
    await useLibraryStore.getState().fetchPlaylists()
    expect(console.error).toHaveBeenCalled()
  })

  it('fetchHome stops loading and logs on error', async () => {
    vi.mocked(jellyfin.getRecentlyAdded).mockRejectedValue(new Error('boom'))
    vi.mocked(jellyfin.getRecentlyPlayed).mockResolvedValue({ Items: [], TotalRecordCount: 0 })
    await useLibraryStore.getState().fetchHome()
    expect(useLibraryStore.getState().isLoading).toBe(false)
    expect(console.error).toHaveBeenCalled()
  })
})

describe('load-more fetches', () => {
  it('loadMoreAlbums fetches the next page when more remain', async () => {
    useLibraryStore.setState({ albums: [{ Id: 'a0', Name: 'A' }], totalAlbums: 200 })
    vi.mocked(jellyfin.getAlbums).mockResolvedValue({ Items: [{ Id: 'a1', Name: 'A1' }], TotalRecordCount: 200 })
    await useLibraryStore.getState().loadMoreAlbums()
    expect(jellyfin.getAlbums).toHaveBeenCalledWith(1, 100)
    expect(useLibraryStore.getState().albums.map(a => a.Id)).toEqual(['a0', 'a1'])
  })

  it('loadMoreSongs does nothing once everything is loaded', async () => {
    useLibraryStore.setState({ songs: [{ Id: 's0', Name: 'S' }], totalSongs: 1 })
    await useLibraryStore.getState().loadMoreSongs()
    expect(jellyfin.getSongs).not.toHaveBeenCalled()
  })
})

describe('refreshAll & reset', () => {
  it('refreshAll clears the audio cache and reloads everything', async () => {
    vi.mocked(jellyfin.getAlbums).mockResolvedValue({ Items: [], TotalRecordCount: 0 })
    vi.mocked(jellyfin.getArtists).mockResolvedValue({ Items: [], TotalRecordCount: 0 })
    vi.mocked(jellyfin.getSongs).mockResolvedValue({ Items: [], TotalRecordCount: 0 })
    vi.mocked(jellyfin.getPlaylists).mockResolvedValue({ Items: [], TotalRecordCount: 0 })
    vi.mocked(jellyfin.getRecentlyAdded).mockResolvedValue({ Items: [], TotalRecordCount: 0 })
    vi.mocked(jellyfin.getRecentlyPlayed).mockResolvedValue({ Items: [], TotalRecordCount: 0 })
    await useLibraryStore.getState().refreshAll()
    expect(window.api.clearCache).toHaveBeenCalled()
    expect(useLibraryStore.getState().isLoading).toBe(false)
  })

  it('reset empties all collections and counts', () => {
    useLibraryStore.setState({ albums: [{ Id: 'a', Name: 'A' }], totalAlbums: 5 })
    useLibraryStore.getState().reset()
    const s = useLibraryStore.getState()
    expect(s.albums).toEqual([])
    expect(s.totalAlbums).toBe(0)
  })
})
