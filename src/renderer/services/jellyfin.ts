export interface JellyfinAuth {
  serverUrl: string
  token: string
  userId: string
  username: string
  serverId: string
}

export interface JellyfinItem {
  Id: string
  Name: string
  Type: string
  AlbumId?: string
  AlbumArtist?: string
  Album?: string
  Artists?: string[]
  ArtistItems?: { Id: string; Name: string }[]
  AlbumArtists?: { Id: string; Name: string }[]
  IndexNumber?: number
  ParentIndexNumber?: number
  ProductionYear?: number
  RunTimeTicks?: number
  ImageTags?: Record<string, string>
  BackdropImageTags?: string[]
  ParentBackdropImageTags?: string[]
  Genres?: string[]
  Overview?: string
  ChildCount?: number
  SongCount?: number
  AlbumCount?: number
  UserData?: {
    PlayCount: number
    IsFavorite: boolean
    LastPlayedDate?: string
    PlaybackPositionTicks?: number
  }
  MediaSources?: {
    Id: string
    Path: string
    Container: string
    Size: number
    Bitrate: number
  }[]
}

export interface JellyfinItemsResponse {
  Items: JellyfinItem[]
  TotalRecordCount: number
}

const CLIENT_NAME = 'JellyfinMusicPlayer'
const CLIENT_VERSION = '0.1.0'
const DEVICE_NAME = 'Desktop'
const DEVICE_ID = 'jellyfin-music-player-' + Math.random().toString(36).slice(2)

class JellyfinService {
  private auth: JellyfinAuth | null = null

  get isAuthenticated() {
    return this.auth !== null
  }

  get serverUrl() {
    return this.auth?.serverUrl || ''
  }

  get userId() {
    return this.auth?.userId || ''
  }

  get token() {
    return this.auth?.token || ''
  }

  setAuth(auth: JellyfinAuth) {
    this.auth = auth
  }

  clearAuth() {
    this.auth = null
  }

  private authHeader(): string {
    const parts = [
      `MediaBrowser Client="${CLIENT_NAME}"`,
      `Device="${DEVICE_NAME}"`,
      `DeviceId="${DEVICE_ID}"`,
      `Version="${CLIENT_VERSION}"`
    ]
    if (this.auth?.token) {
      parts.push(`Token="${this.auth.token}"`)
    }
    return parts.join(', ')
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    if (!this.auth) throw new Error('Not authenticated')
    const url = `${this.auth.serverUrl}${path}`
    const res = await fetch(url, {
      ...options,
      headers: {
        'X-Emby-Authorization': this.authHeader(),
        'Content-Type': 'application/json',
        ...options?.headers
      }
    })
    if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`)
    if (res.status === 204) return undefined as T
    return res.json()
  }

  async authenticate(serverUrl: string, username: string, password: string): Promise<JellyfinAuth> {
    const cleanUrl = serverUrl.replace(/\/+$/, '')
    const url = `${cleanUrl}/Users/AuthenticateByName`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Emby-Authorization': `MediaBrowser Client="${CLIENT_NAME}", Device="${DEVICE_NAME}", DeviceId="${DEVICE_ID}", Version="${CLIENT_VERSION}"`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ Username: username, Pw: password })
    })

    if (!res.ok) {
      if (res.status === 401) throw new Error('Credenciais inválidas')
      throw new Error(`Erro ao conectar: ${res.status}`)
    }

    const data = await res.json()
    this.auth = {
      serverUrl: cleanUrl,
      token: data.AccessToken,
      userId: data.User.Id,
      username: data.User.Name,
      serverId: data.ServerId
    }
    return this.auth
  }

  async testConnection(serverUrl: string): Promise<boolean> {
    try {
      const cleanUrl = serverUrl.replace(/\/+$/, '')
      const res = await fetch(`${cleanUrl}/System/Info/Public`)
      return res.ok
    } catch {
      return false
    }
  }

  // --- Library ---

  async getAlbums(startIndex = 0, limit = 100, sortBy = 'SortName'): Promise<JellyfinItemsResponse> {
    return this.request(`/Users/${this.userId}/Items?IncludeItemTypes=MusicAlbum&Recursive=true&SortBy=${sortBy}&SortOrder=Ascending&StartIndex=${startIndex}&Limit=${limit}&Fields=PrimaryImageAspectRatio,SortName,BasicSyncInfo,ProductionYear,Genres,AlbumArtist&ImageTypeLimit=1&EnableImageTypes=Primary`)
  }

  async getAlbumItems(albumId: string): Promise<JellyfinItemsResponse> {
    return this.request(`/Users/${this.userId}/Items?ParentId=${albumId}&SortBy=ParentIndexNumber,IndexNumber,SortName&Fields=MediaSources,RunTimeTicks`)
  }

  async getArtists(startIndex = 0, limit = 100): Promise<JellyfinItemsResponse> {
    return this.request(`/Artists?StartIndex=${startIndex}&Limit=${limit}&SortBy=SortName&SortOrder=Ascending&Recursive=true&Fields=PrimaryImageAspectRatio,SortName,BasicSyncInfo,AlbumCount,SongCount&UserId=${this.userId}&ImageTypeLimit=1&EnableImageTypes=Primary`)
  }

  async getArtistAlbums(artistId: string): Promise<JellyfinItemsResponse> {
    return this.request(`/Users/${this.userId}/Items?IncludeItemTypes=MusicAlbum&Recursive=true&AlbumArtistIds=${artistId}&SortBy=ProductionYear,SortName&SortOrder=Descending&Fields=PrimaryImageAspectRatio,ProductionYear,Genres`)
  }

  async getSongs(startIndex = 0, limit = 100, sortBy = 'SortName'): Promise<JellyfinItemsResponse> {
    return this.request(`/Users/${this.userId}/Items?IncludeItemTypes=Audio&Recursive=true&SortBy=${sortBy}&SortOrder=Ascending&StartIndex=${startIndex}&Limit=${limit}&Fields=MediaSources,RunTimeTicks,AlbumArtist,Album,AlbumId`)
  }

  async getPlaylists(): Promise<JellyfinItemsResponse> {
    return this.request(`/Users/${this.userId}/Items?IncludeItemTypes=Playlist&Recursive=true&SortBy=SortName&Fields=ChildCount,PrimaryImageAspectRatio`)
  }

  async getPlaylistItems(playlistId: string): Promise<JellyfinItemsResponse> {
    return this.request(`/Playlists/${playlistId}/Items?UserId=${this.userId}&Fields=MediaSources,RunTimeTicks,AlbumArtist,Album,AlbumId`)
  }

  async getRecentlyPlayed(limit = 20): Promise<JellyfinItemsResponse> {
    return this.request(`/Users/${this.userId}/Items?IncludeItemTypes=Audio&Recursive=true&SortBy=DatePlayed&SortOrder=Descending&Limit=${limit}&Fields=RunTimeTicks,AlbumArtist,Album,AlbumId&Filters=IsPlayed`)
  }

  async getFrequentlyPlayed(limit = 20): Promise<JellyfinItemsResponse> {
    return this.request(`/Users/${this.userId}/Items?IncludeItemTypes=Audio&Recursive=true&SortBy=PlayCount&SortOrder=Descending&Limit=${limit}&Fields=RunTimeTicks,AlbumArtist,Album,AlbumId&Filters=IsPlayed`)
  }

  async getRecentlyAdded(limit = 20): Promise<JellyfinItemsResponse> {
    return this.request(`/Users/${this.userId}/Items?IncludeItemTypes=MusicAlbum&Recursive=true&SortBy=DateCreated&SortOrder=Descending&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear,Genres,AlbumArtist`)
  }

  async search(query: string, limit = 20): Promise<{ albums: JellyfinItem[]; artists: JellyfinItem[]; songs: JellyfinItem[] }> {
    const [albums, artists, songs] = await Promise.all([
      this.request<JellyfinItemsResponse>(`/Users/${this.userId}/Items?SearchTerm=${encodeURIComponent(query)}&IncludeItemTypes=MusicAlbum&Recursive=true&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear,AlbumArtist`),
      this.request<JellyfinItemsResponse>(`/Users/${this.userId}/Items?SearchTerm=${encodeURIComponent(query)}&IncludeItemTypes=MusicArtist&Recursive=true&Limit=${limit}&Fields=PrimaryImageAspectRatio`),
      this.request<JellyfinItemsResponse>(`/Users/${this.userId}/Items?SearchTerm=${encodeURIComponent(query)}&IncludeItemTypes=Audio&Recursive=true&Limit=${limit}&Fields=RunTimeTicks,AlbumArtist,Album,AlbumId`)
    ])
    return { albums: albums.Items, artists: artists.Items, songs: songs.Items }
  }

  async toggleFavorite(itemId: string, isFavorite: boolean): Promise<void> {
    if (isFavorite) {
      await this.request(`/Users/${this.userId}/FavoriteItems/${itemId}`, { method: 'DELETE' })
    } else {
      await this.request(`/Users/${this.userId}/FavoriteItems/${itemId}`, { method: 'POST' })
    }
  }

  async reportPlaybackStart(itemId: string): Promise<void> {
    await this.request('/Sessions/Playing', {
      method: 'POST',
      body: JSON.stringify({ ItemId: itemId, CanSeek: true })
    })
  }

  async reportPlaybackStopped(itemId: string, positionTicks: number): Promise<void> {
    await this.request('/Sessions/Playing/Stopped', {
      method: 'POST',
      body: JSON.stringify({ ItemId: itemId, PositionTicks: positionTicks })
    })
  }

  // --- URLs ---

  getStreamUrl(itemId: string): string {
    return `${this.serverUrl}/Audio/${itemId}/stream?api_key=${this.token}&static=true`
  }

  getImageUrl(itemId: string, imageTag?: string, maxSize = 300): string {
    const tag = imageTag ? `&tag=${imageTag}` : ''
    return `${this.serverUrl}/Items/${itemId}/Images/Primary?maxHeight=${maxSize}&maxWidth=${maxSize}${tag}&quality=90&api_key=${this.token}`
  }

  getDownloadUrl(itemId: string): string {
    return `${this.serverUrl}/Items/${itemId}/Download?api_key=${this.token}`
  }
}

export const jellyfin = new JellyfinService()
