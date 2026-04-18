import { create } from 'zustand'
import { JellyfinItem, JellyfinItemsResponse, jellyfin } from '../services/jellyfin'

interface LibraryState {
  albums: JellyfinItem[]
  artists: JellyfinItem[]
  songs: JellyfinItem[]
  playlists: JellyfinItem[]
  recentlyAdded: JellyfinItem[]
  recentlyPlayed: JellyfinItem[]
  totalAlbums: number
  totalArtists: number
  totalSongs: number
  isLoading: boolean

  fetchAlbums: (startIndex?: number) => Promise<void>
  fetchArtists: (startIndex?: number) => Promise<void>
  fetchSongs: (startIndex?: number) => Promise<void>
  fetchPlaylists: () => Promise<void>
  fetchHome: () => Promise<void>
  loadMoreAlbums: () => Promise<void>
  loadMoreSongs: () => Promise<void>
  refreshAll: () => Promise<void>
  reset: () => void
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  albums: [],
  artists: [],
  songs: [],
  playlists: [],
  recentlyAdded: [],
  recentlyPlayed: [],
  totalAlbums: 0,
  totalArtists: 0,
  totalSongs: 0,
  isLoading: false,

  fetchAlbums: async (startIndex = 0) => {
    set({ isLoading: true })
    try {
      const res = await jellyfin.getAlbums(startIndex, 100)
      set({
        albums: startIndex === 0 ? res.Items : [...get().albums, ...res.Items],
        totalAlbums: res.TotalRecordCount,
        isLoading: false
      })
    } catch (err) {
      console.error('Failed to fetch albums:', err)
      set({ isLoading: false })
    }
  },

  fetchArtists: async (startIndex = 0) => {
    set({ isLoading: true })
    try {
      const res = await jellyfin.getArtists(startIndex, 100)
      set({
        artists: startIndex === 0 ? res.Items : [...get().artists, ...res.Items],
        totalArtists: res.TotalRecordCount,
        isLoading: false
      })
    } catch (err) {
      console.error('Failed to fetch artists:', err)
      set({ isLoading: false })
    }
  },

  fetchSongs: async (startIndex = 0) => {
    set({ isLoading: true })
    try {
      const res = await jellyfin.getSongs(startIndex, 10000)
      set({
        songs: startIndex === 0 ? res.Items : [...get().songs, ...res.Items],
        totalSongs: res.TotalRecordCount,
        isLoading: false
      })
    } catch (err) {
      console.error('Failed to fetch songs:', err)
      set({ isLoading: false })
    }
  },

  fetchPlaylists: async () => {
    try {
      const res = await jellyfin.getPlaylists()
      set({ playlists: res.Items })
    } catch (err) {
      console.error('Failed to fetch playlists:', err)
    }
  },

  fetchHome: async () => {
    set({ isLoading: true })
    try {
      const [recent, played] = await Promise.all([
        jellyfin.getRecentlyAdded(20),
        jellyfin.getRecentlyPlayed(20)
      ])
      set({
        recentlyAdded: recent.Items,
        recentlyPlayed: played.Items,
        isLoading: false
      })
    } catch (err) {
      console.error('Failed to fetch home:', err)
      set({ isLoading: false })
    }
  },

  loadMoreAlbums: async () => {
    const { albums, totalAlbums } = get()
    if (albums.length >= totalAlbums) return
    await get().fetchAlbums(albums.length)
  },

  loadMoreSongs: async () => {
    const { songs, totalSongs } = get()
    if (songs.length >= totalSongs) return
    await get().fetchSongs(songs.length)
  },

  refreshAll: async () => {
    set({ isLoading: true })
    get().reset()
    try {
      // Clear audio cache to remove stale entries
      await window.api.clearCache()

      await Promise.all([
        get().fetchAlbums(0),
        get().fetchArtists(0),
        get().fetchSongs(0),
        get().fetchPlaylists(),
        get().fetchHome()
      ])
    } finally {
      set({ isLoading: false })
    }
  },

  reset: () => set({
    albums: [],
    artists: [],
    songs: [],
    playlists: [],
    recentlyAdded: [],
    recentlyPlayed: [],
    totalAlbums: 0,
    totalArtists: 0,
    totalSongs: 0
  })
}))
