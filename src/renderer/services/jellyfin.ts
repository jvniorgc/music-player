export interface JellyfinAuth {
  serverUrl: string
  token: string
  userId: string
  username: string
  serverId: string
}

export interface JellyfinUser {
  Id: string
  Name: string
  PrimaryImageTag?: string
  HasPassword?: boolean
  LastLoginDate?: string
  LastActivityDate?: string
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
  PlaylistItemId?: string
  HasLyrics?: boolean
  Container?: string
  Path?: string
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
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`API error: ${res.status} ${res.statusText} - ${body}`)
    }
    if (res.status === 204) return undefined as T
    const text = await res.text()
    if (!text) return undefined as T
    return JSON.parse(text)
  }

  /** Filter out items with empty/missing names (broken metadata) */
  private sanitizeItems(response: JellyfinItemsResponse): JellyfinItemsResponse {
    const filtered = response.Items.filter(item => item.Name && item.Name.trim() !== '')
    return { Items: filtered, TotalRecordCount: filtered.length }
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
    const res = await this.request<JellyfinItemsResponse>(`/Users/${this.userId}/Items?IncludeItemTypes=MusicAlbum&Recursive=true&SortBy=${sortBy}&SortOrder=Ascending&StartIndex=${startIndex}&Limit=${limit}&Fields=PrimaryImageAspectRatio,SortName,BasicSyncInfo,ProductionYear,Genres,AlbumArtist&ImageTypeLimit=1&EnableImageTypes=Primary`)
    return this.sanitizeItems(res)
  }

  async getAlbumItems(albumId: string): Promise<JellyfinItemsResponse> {
    return this.request(`/Users/${this.userId}/Items?ParentId=${albumId}&SortBy=ParentIndexNumber,IndexNumber,SortName&Fields=MediaSources,RunTimeTicks,HasLyrics`)
  }

  async getArtists(startIndex = 0, limit = 100): Promise<JellyfinItemsResponse> {
    const res = await this.request<JellyfinItemsResponse>(`/Artists?StartIndex=${startIndex}&Limit=${limit}&SortBy=SortName&SortOrder=Ascending&Recursive=true&Fields=PrimaryImageAspectRatio,SortName,BasicSyncInfo,AlbumCount,SongCount&UserId=${this.userId}&ImageTypeLimit=1&EnableImageTypes=Primary`)
    return this.sanitizeItems(res)
  }

  async getArtistAlbums(artistId: string): Promise<JellyfinItemsResponse> {
    const res = await this.request<JellyfinItemsResponse>(`/Users/${this.userId}/Items?IncludeItemTypes=MusicAlbum&Recursive=true&AlbumArtistIds=${artistId}&SortBy=ProductionYear,SortName&SortOrder=Descending&Fields=PrimaryImageAspectRatio,ProductionYear,Genres`)
    return this.sanitizeItems(res)
  }

  async getSongs(startIndex = 0, limit = 100, sortBy = 'SortName'): Promise<JellyfinItemsResponse> {
    const res = await this.request<JellyfinItemsResponse>(`/Users/${this.userId}/Items?IncludeItemTypes=Audio&Recursive=true&SortBy=${sortBy}&SortOrder=Ascending&StartIndex=${startIndex}&Limit=${limit}&Fields=MediaSources,RunTimeTicks,AlbumArtist,Album,AlbumId,HasLyrics`)
    return this.sanitizeItems(res)
  }

  async getPlaylists(): Promise<JellyfinItemsResponse> {
    const res = await this.request<JellyfinItemsResponse>(
      `/Users/${this.userId}/Items?IncludeItemTypes=Playlist&Recursive=true&SortBy=SortName&Fields=ChildCount,PrimaryImageAspectRatio,Path`
    )
    // Filter out file-based M3U playlists (auto-created by library scan, often buggy/read-only)
    const filtered = res.Items.filter(item => {
      const path = (item as any).Path || ''
      return !path.endsWith('.m3u') && !path.endsWith('.m3u8')
    })
    return { Items: filtered, TotalRecordCount: filtered.length }
  }

  async getPlaylistItems(playlistId: string): Promise<JellyfinItemsResponse> {
    return this.request(`/Playlists/${playlistId}/Items?UserId=${this.userId}&Fields=MediaSources,RunTimeTicks,AlbumArtist,Album,AlbumId,PlaylistItemId,HasLyrics`)
  }

  async getRecentlyPlayed(limit = 20): Promise<JellyfinItemsResponse> {
    const res = await this.request<JellyfinItemsResponse>(`/Users/${this.userId}/Items?IncludeItemTypes=Audio&Recursive=true&SortBy=DatePlayed&SortOrder=Descending&Limit=${limit}&Fields=RunTimeTicks,AlbumArtist,Album,AlbumId,HasLyrics&Filters=IsPlayed`)
    return this.sanitizeItems(res)
  }

  async getFrequentlyPlayed(limit = 20): Promise<JellyfinItemsResponse> {
    const res = await this.request<JellyfinItemsResponse>(`/Users/${this.userId}/Items?IncludeItemTypes=Audio&Recursive=true&SortBy=PlayCount&SortOrder=Descending&Limit=${limit}&Fields=RunTimeTicks,AlbumArtist,Album,AlbumId,HasLyrics&Filters=IsPlayed`)
    return this.sanitizeItems(res)
  }

  async getRecentlyAdded(limit = 20): Promise<JellyfinItemsResponse> {
    const res = await this.request<JellyfinItemsResponse>(`/Users/${this.userId}/Items?IncludeItemTypes=MusicAlbum&Recursive=true&SortBy=DateCreated&SortOrder=Descending&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear,Genres,AlbumArtist`)
    return this.sanitizeItems(res)
  }

  async search(query: string, limit = 20): Promise<{ albums: JellyfinItem[]; artists: JellyfinItem[]; songs: JellyfinItem[] }> {
    const [albums, artists, songs] = await Promise.all([
      this.request<JellyfinItemsResponse>(`/Users/${this.userId}/Items?SearchTerm=${encodeURIComponent(query)}&IncludeItemTypes=MusicAlbum&Recursive=true&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear,AlbumArtist`),
      this.request<JellyfinItemsResponse>(`/Users/${this.userId}/Items?SearchTerm=${encodeURIComponent(query)}&IncludeItemTypes=MusicArtist&Recursive=true&Limit=${limit}&Fields=PrimaryImageAspectRatio`),
      this.request<JellyfinItemsResponse>(`/Users/${this.userId}/Items?SearchTerm=${encodeURIComponent(query)}&IncludeItemTypes=Audio&Recursive=true&Limit=${limit}&Fields=RunTimeTicks,AlbumArtist,Album,AlbumId,HasLyrics`)
    ])
    return {
      albums: this.sanitizeItems(albums).Items,
      artists: this.sanitizeItems(artists).Items,
      songs: this.sanitizeItems(songs).Items
    }
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

  // --- Playlists CRUD ---

  async createPlaylist(name: string, itemIds: string[] = []): Promise<{ Id: string }> {
    return this.request('/Playlists', {
      method: 'POST',
      body: JSON.stringify({ Name: name, Ids: itemIds, UserId: this.userId, MediaType: 'Audio' })
    })
  }

  async deleteItem(itemId: string): Promise<void> {
    return this.request(`/Items/${itemId}`, { method: 'DELETE' })
  }

  async renameItem(itemId: string, name: string): Promise<void> {
    const item = await this.request<any>(`/Users/${this.userId}/Items/${itemId}`)
    item.Name = name
    return this.request(`/Items/${itemId}`, {
      method: 'POST',
      body: JSON.stringify(item)
    })
  }

  async getFullItem(itemId: string): Promise<any> {
    return this.request(`/Users/${this.userId}/Items/${itemId}`)
  }

  async updateItem(itemId: string, updates: Record<string, any>): Promise<void> {
    const item = await this.getFullItem(itemId)
    Object.assign(item, updates)
    return this.request(`/Items/${itemId}`, {
      method: 'POST',
      body: JSON.stringify(item)
    })
  }

  async uploadImage(itemId: string, imageUrl: string): Promise<void> {
    // Download image from URL
    const res = await fetch(imageUrl, { redirect: 'follow' })
    if (!res.ok) throw new Error(`Failed to fetch cover art: ${res.status}`)
    const blob = await res.blob()
    const buffer = await blob.arrayBuffer()
    const bytes = new Uint8Array(buffer)

    // Convert to base64 in chunks to avoid call stack overflow
    let base64 = ''
    const chunk = 8192
    for (let i = 0; i < bytes.length; i += chunk) {
      base64 += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    base64 = btoa(base64)

    const contentType = blob.type || 'image/jpeg'
    const uploadRes = await fetch(`${this.serverUrl}/Items/${itemId}/Images/Primary`, {
      method: 'POST',
      headers: {
        'X-Emby-Authorization': this.authHeader(),
        'Content-Type': contentType
      },
      body: base64
    })
    if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`)
  }

  async deleteImage(itemId: string): Promise<void> {
    return this.request(`/Items/${itemId}/Images/Primary`, { method: 'DELETE' })
  }

  async refreshItem(itemId: string): Promise<void> {
    return this.request(`/Items/${itemId}/Refresh?Recursive=true&MetadataRefreshMode=FullRefresh&ReplaceAllMetadata=false`, {
      method: 'POST'
    })
  }

  async addToPlaylist(playlistId: string, itemIds: string[]): Promise<void> {
    return this.request(`/Playlists/${playlistId}/Items?Ids=${itemIds.join(',')}&UserId=${this.userId}`, {
      method: 'POST'
    })
  }

  async removeFromPlaylist(playlistId: string, entryIds: string[]): Promise<void> {
    return this.request(`/Playlists/${playlistId}/Items?EntryIds=${entryIds.join(',')}`, {
      method: 'DELETE'
    })
  }

  async movePlaylistItem(playlistId: string, itemId: string, newIndex: number): Promise<void> {
    return this.request(`/Playlists/${playlistId}/Items/${itemId}/Move/${newIndex}`, {
      method: 'POST'
    })
  }

  // --- Social / Users ---

  async getUsers(): Promise<JellyfinUser[]> {
    return this.request<JellyfinUser[]>('/Users')
  }

  getUserImageUrl(userId: string, imageTag?: string, maxSize = 200): string {
    const tag = imageTag ? `&tag=${imageTag}` : ''
    return `${this.serverUrl}/Users/${userId}/Images/Primary?maxHeight=${maxSize}&maxWidth=${maxSize}${tag}&quality=90&api_key=${this.token}`
  }

  async getUserPlaylists(userId: string): Promise<JellyfinItemsResponse> {
    const res = await this.request<{ Items: (JellyfinItem & { OwnerUserId?: string })[], TotalRecordCount: number }>(
      `/Users/${userId}/Items?IncludeItemTypes=Playlist&Recursive=true&SortBy=SortName&Fields=ChildCount,PrimaryImageAspectRatio,OwnerUserId`
    )
    const filtered = res.Items.filter(item => item.Name && item.Name.trim() !== '' && item.OwnerUserId === userId)
    return { Items: filtered, TotalRecordCount: filtered.length }
  }

  /**
   * Query the Playback Reporting plugin for individual play events.
   * Returns top played song ItemIds with their play count within the period.
   */
  private async queryPlaybackReport(userId: string, minDate?: string, limit = 100): Promise<{ itemId: string; playCount: number }[]> {
    const userIdNormalized = userId.replace(/-/g, '')
    const dateFilter = minDate ? ` AND DateCreated >= '${minDate}'` : ''
    const sql = `SELECT ItemId, COUNT(*) as play_count FROM PlaybackActivity WHERE UserId='${userIdNormalized}' AND ItemType='Audio'${dateFilter} GROUP BY ItemId ORDER BY play_count DESC LIMIT ${limit}`
    const res = await this.request<{
      colums: string[]
      results: any[][]
      message: string
    }>('/user_usage_stats/submit_custom_query', {
      method: 'POST',
      body: JSON.stringify({ CustomQueryString: sql, ReplaceUserId: false })
    })
    if (!res.results || res.results.length === 0) return []
    return res.results.map(row => ({
      itemId: row[0] as string,
      playCount: parseInt(row[1] as string, 10)
    }))
  }

  /**
   * Get top artists for a user within a time period using Playback Reporting plugin.
   * For all-time, uses native Jellyfin PlayCount (full historical data).
   */
  async getUserTopArtists(userId: string, limit = 20, minDate?: string): Promise<(JellyfinItem & { periodPlayCount?: number })[]> {
    // All-time: fetch top played songs and aggregate by artist
    if (!minDate) {
      const songsUrl = `/Users/${userId}/Items?IncludeItemTypes=Audio&Recursive=true&SortBy=PlayCount&SortOrder=Descending&Limit=200&Fields=AlbumArtist,AlbumArtists,ArtistItems&Filters=IsPlayed`
      const songsRes = await this.request<JellyfinItemsResponse>(songsUrl)
      const songs = this.sanitizeItems(songsRes).Items

      // Aggregate play counts by artist
      const artistMap = new Map<string, { id: string; name: string; playCount: number }>()
      for (const song of songs) {
        const artistEntry = song.AlbumArtists?.[0] || song.ArtistItems?.[0]
        if (!artistEntry) continue
        const playCount = song.UserData?.PlayCount || 0
        const existing = artistMap.get(artistEntry.Id)
        if (existing) {
          existing.playCount += playCount
        } else {
          artistMap.set(artistEntry.Id, { id: artistEntry.Id, name: artistEntry.Name, playCount })
        }
      }

      const sorted = [...artistMap.values()].sort((a, b) => b.playCount - a.playCount).slice(0, limit)
      if (sorted.length === 0) return []

      const artistIds = sorted.map(a => a.id)
      const artistRes = await this.request<JellyfinItemsResponse>(
        `/Users/${userId}/Items?Ids=${artistIds.join(',')}&Fields=PrimaryImageAspectRatio,SongCount,AlbumCount`
      )

      return sorted.map(s => {
        const artist = artistRes.Items.find(a => a.Id === s.id)
        if (!artist) return null
        return { ...artist, periodPlayCount: s.playCount }
      }).filter(Boolean) as (JellyfinItem & { periodPlayCount?: number })[]
    }

    try {
      const plays = await this.queryPlaybackReport(userId, minDate, 200)
      if (plays.length === 0) return []

      // Fetch item details to get AlbumArtist info
      const itemIds = plays.map(p => p.itemId)
      const res = await this.request<JellyfinItemsResponse>(
        `/Users/${this.userId}/Items?Ids=${itemIds.join(',')}&Fields=AlbumArtist,AlbumArtists,PrimaryImageAspectRatio,AlbumId`
      )

      // Aggregate play counts by artist
      const artistMap = new Map<string, { id: string; name: string; playCount: number }>()
      for (const item of res.Items) {
        const play = plays.find(p => p.itemId === item.Id)
        if (!play) continue
        const artistEntry = item.AlbumArtists?.[0] || item.ArtistItems?.[0]
        if (!artistEntry) continue
        const existing = artistMap.get(artistEntry.Id)
        if (existing) {
          existing.playCount += play.playCount
        } else {
          artistMap.set(artistEntry.Id, { id: artistEntry.Id, name: artistEntry.Name, playCount: play.playCount })
        }
      }

      // Sort by play count and fetch artist details
      const sorted = [...artistMap.values()].sort((a, b) => b.playCount - a.playCount).slice(0, limit)
      if (sorted.length === 0) return []

      const artistIds = sorted.map(a => a.id)
      const artistRes = await this.request<JellyfinItemsResponse>(
        `/Users/${this.userId}/Items?Ids=${artistIds.join(',')}&Fields=PrimaryImageAspectRatio,SongCount,AlbumCount`
      )

      return sorted.map(s => {
        const artist = artistRes.Items.find(a => a.Id === s.id)
        if (!artist) return null
        return { ...artist, periodPlayCount: s.playCount }
      }).filter(Boolean) as (JellyfinItem & { periodPlayCount?: number })[]
    } catch {
      // Fallback: plugin not available
      return this.getUserTopArtists(userId, limit, undefined)
    }
  }

  /**
   * Get top albums for a user within a time period using Playback Reporting plugin.
   * For all-time, uses native Jellyfin PlayCount.
   */
  async getUserTopAlbums(userId: string, limit = 20, minDate?: string): Promise<(JellyfinItem & { periodPlayCount?: number })[]> {
    // All-time: fetch top played songs and aggregate by album
    if (!minDate) {
      const songsUrl = `/Users/${userId}/Items?IncludeItemTypes=Audio&Recursive=true&SortBy=PlayCount&SortOrder=Descending&Limit=200&Fields=AlbumId,AlbumArtist,Album&Filters=IsPlayed`
      const songsRes = await this.request<JellyfinItemsResponse>(songsUrl)
      const songs = this.sanitizeItems(songsRes).Items

      // Aggregate play counts by album
      const albumMap = new Map<string, { id: string; playCount: number }>()
      for (const song of songs) {
        if (!song.AlbumId) continue
        const playCount = song.UserData?.PlayCount || 0
        const existing = albumMap.get(song.AlbumId)
        if (existing) {
          existing.playCount += playCount
        } else {
          albumMap.set(song.AlbumId, { id: song.AlbumId, playCount })
        }
      }

      const sorted = [...albumMap.values()].sort((a, b) => b.playCount - a.playCount).slice(0, limit)
      if (sorted.length === 0) return []

      const albumIds = sorted.map(a => a.id)
      const albumRes = await this.request<JellyfinItemsResponse>(
        `/Users/${userId}/Items?Ids=${albumIds.join(',')}&Fields=PrimaryImageAspectRatio,ProductionYear,AlbumArtist`
      )

      return sorted.map(s => {
        const album = albumRes.Items.find(a => a.Id === s.id)
        if (!album) return null
        return { ...album, periodPlayCount: s.playCount }
      }).filter(Boolean) as (JellyfinItem & { periodPlayCount?: number })[]
    }

    try {
      const plays = await this.queryPlaybackReport(userId, minDate, 200)
      if (plays.length === 0) return []

      // Fetch item details to get AlbumId
      const itemIds = plays.map(p => p.itemId)
      const res = await this.request<JellyfinItemsResponse>(
        `/Users/${this.userId}/Items?Ids=${itemIds.join(',')}&Fields=AlbumId,AlbumArtist,PrimaryImageAspectRatio`
      )

      // Aggregate play counts by album
      const albumMap = new Map<string, { id: string; playCount: number }>()
      for (const item of res.Items) {
        const play = plays.find(p => p.itemId === item.Id)
        if (!play || !item.AlbumId) continue
        const existing = albumMap.get(item.AlbumId)
        if (existing) {
          existing.playCount += play.playCount
        } else {
          albumMap.set(item.AlbumId, { id: item.AlbumId, playCount: play.playCount })
        }
      }

      // Sort by play count and fetch album details
      const sorted = [...albumMap.values()].sort((a, b) => b.playCount - a.playCount).slice(0, limit)
      if (sorted.length === 0) return []

      const albumIds = sorted.map(a => a.id)
      const albumRes = await this.request<JellyfinItemsResponse>(
        `/Users/${this.userId}/Items?Ids=${albumIds.join(',')}&Fields=PrimaryImageAspectRatio,ProductionYear,AlbumArtist`
      )

      return sorted.map(s => {
        const album = albumRes.Items.find(a => a.Id === s.id)
        if (!album) return null
        return { ...album, periodPlayCount: s.playCount }
      }).filter(Boolean) as (JellyfinItem & { periodPlayCount?: number })[]
    } catch {
      // Fallback: plugin not available
      return this.getUserTopAlbums(userId, limit, undefined)
    }
  }

  /**
   * Get top songs for a user within a time period using Playback Reporting plugin.
   * For all-time, uses native Jellyfin PlayCount.
   */
  async getUserTopSongs(userId: string, limit = 20, minDate?: string): Promise<(JellyfinItem & { periodPlayCount?: number })[]> {
    // All-time: use native Jellyfin API
    if (!minDate) {
      const url = `/Users/${userId}/Items?IncludeItemTypes=Audio&Recursive=true&SortBy=PlayCount&SortOrder=Descending&Limit=${limit}&Fields=RunTimeTicks,AlbumArtist,Album,AlbumId,Artists,HasLyrics&Filters=IsPlayed`
      const res = await this.request<JellyfinItemsResponse>(url)
      return this.sanitizeItems(res).Items
    }

    try {
      const plays = await this.queryPlaybackReport(userId, minDate, limit)
      if (plays.length === 0) return []

      const itemIds = plays.map(p => p.itemId)
      const res = await this.request<JellyfinItemsResponse>(
        `/Users/${this.userId}/Items?Ids=${itemIds.join(',')}&Fields=RunTimeTicks,AlbumArtist,Album,AlbumId,Artists,HasLyrics`
      )

      return plays.map(p => {
        const item = res.Items.find(i => i.Id === p.itemId)
        if (!item) return null
        return { ...item, periodPlayCount: p.playCount }
      }).filter(Boolean) as (JellyfinItem & { periodPlayCount?: number })[]
    } catch {
      // Fallback: plugin not available
      const url = `/Users/${userId}/Items?IncludeItemTypes=Audio&Recursive=true&SortBy=PlayCount&SortOrder=Descending&Limit=${limit}&Fields=RunTimeTicks,AlbumArtist,Album,AlbumId,Artists,HasLyrics&Filters=IsPlayed`
      const res = await this.request<JellyfinItemsResponse>(url)
      return this.sanitizeItems(res).Items
    }
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

  async getLyrics(itemId: string): Promise<{ Text: string; Start?: number }[]> {
    // Try Jellyfin embedded lyrics first
    try {
      const res = await fetch(`${this.serverUrl}/Audio/${itemId}/Lyrics?api_key=${this.token}`)
      if (res.ok) {
        const data = await res.json()
        if (data.Lyrics && data.Lyrics.length > 0) return data.Lyrics
      }
    } catch { /* fallback below */ }

    // Fallback: fetch from LRCLIB using track metadata
    try {
      const item = await this.request<JellyfinItem>(`/Users/${this.userId}/Items/${itemId}`)
      const artist = item.Artists?.[0] || item.AlbumArtist || ''
      const track = item.Name || ''
      const album = item.Album || ''
      if (!artist || !track) return []

      const params = new URLSearchParams({ artist_name: artist, track_name: track })
      if (album) params.set('album_name', album)

      const lrcRes = await fetch(`https://lrclib.net/api/get?${params}`, {
        headers: { 'User-Agent': 'JellyfinMusicPlayer/1.0.0' }
      })
      if (!lrcRes.ok) return []
      const lrc = await lrcRes.json()

      // Prefer synced lyrics (with timestamps)
      if (lrc.syncedLyrics) {
        return parseLRC(lrc.syncedLyrics)
      }
      // Fall back to plain lyrics
      if (lrc.plainLyrics) {
        return lrc.plainLyrics.split('\n').filter((l: string) => l.trim()).map((l: string) => ({ Text: l }))
      }
    } catch { /* no lyrics available */ }

    return []
  }
  async getLyricsWithCache(itemId: string): Promise<{ Text: string; Start?: number }[]> {
    // Check persistent downloaded lyrics first (offline)
    try {
      const downloaded = await window.api.getDownloadedLyrics(itemId)
      if (downloaded) return JSON.parse(downloaded)
    } catch {}

    // Check session cache
    try {
      const cached = await window.api.getCachedLyrics(itemId)
      if (cached) return JSON.parse(cached)
    } catch {}

    const lines = await this.getLyrics(itemId)

    // Save to session cache (even empty results to avoid re-fetching)
    try {
      await window.api.saveLyrics(itemId, JSON.stringify(lines))
    } catch {}

    return lines
  }
}

function parseLRC(lrc: string): { Text: string; Start?: number }[] {
  const lines: { Text: string; Start?: number }[] = []
  for (const line of lrc.split('\n')) {
    const match = line.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)$/)
    if (match) {
      const min = parseInt(match[1])
      const sec = parseInt(match[2])
      const ms = parseInt(match[3].padEnd(3, '0'))
      const ticks = (min * 60 + sec + ms / 1000) * 10000000
      const text = match[4].trim()
      if (text) lines.push({ Text: text, Start: ticks })
    }
  }
  return lines
}

export const jellyfin = new JellyfinService()
