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
  Policy?: { IsAdministrator?: boolean }
}

/**
 * Routes admin-backed calls through the companion social API. Resolves
 * `{ handled: false }` when the API is unavailable so the caller can fall back
 * to the direct Jellyfin call. Injected (by social.ts) to avoid a circular import.
 */
export type AdminProxy = (path: string, init: RequestInit) => Promise<{ handled: true; data: unknown } | { handled: false }>

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
  ProviderIds?: Record<string, string>
  /** ReplayGain-style track gain in dB (Jellyfin 10.9+, computed by the library scan). */
  NormalizationGain?: number
}

/** Full item DTO as returned by /Users/{id}/Items/{id}, round-tripped on updates. */
export type JellyfinFullItem = JellyfinItem & { Tags?: string[]; [key: string]: unknown }

export interface JellyfinItemsResponse {
  Items: JellyfinItem[]
  TotalRecordCount: number
}

import { timeoutSignal } from './http'
import { TICKS_PER_SECOND } from '../lib/format'
import { streamBitrateKbps } from '../lib/streaming'
import { useStreamingPrefs } from '../stores/prefs/streaming'
import { shouldReportPlays } from '../stores/prefs/privacy'

type RequestOptions = RequestInit & { timeoutMs?: number }

const UPLOAD_TIMEOUT_MS = 120_000

const CLIENT_NAME = 'JellyfinMusicPlayer'
const CLIENT_VERSION = '0.1.0'
const DEVICE_NAME = 'Desktop'
const DEVICE_ID = 'jellyfin-music-player-' + Math.random().toString(36).slice(2)

class JellyfinService {
  private auth: JellyfinAuth | null = null
  private unauthorizedListeners = new Set<() => void>()
  private adminProxy: AdminProxy | null = null

  setAdminProxy(proxy: AdminProxy | null): void {
    this.adminProxy = proxy
  }

  private async viaAdminProxy<T>(path: string, init: RequestInit): Promise<{ handled: true; data: T } | { handled: false }> {
    if (!this.adminProxy) return { handled: false }
    return this.adminProxy(path, init) as Promise<{ handled: true; data: T } | { handled: false }>
  }

  /**
   * Subscribe to session expiry: fired once when an authenticated request gets
   * a 401 (the token was revoked or expired). Returns an unsubscribe function.
   */
  onUnauthorized(cb: () => void): () => void {
    this.unauthorizedListeners.add(cb)
    return () => { this.unauthorizedListeners.delete(cb) }
  }

  private handleUnauthorized() {
    if (!this.auth) return
    this.auth = null
    for (const cb of this.unauthorizedListeners) {
      try { cb() } catch (err) { console.warn('[jellyfin] unauthorized listener failed', err) }
    }
  }

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

  get serverId() {
    return this.auth?.serverId || ''
  }

  setAuth(auth: JellyfinAuth) {
    this.auth = auth
  }

  clearAuth() {
    this.auth = null
  }

  authHeader(): string {
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

  /** Authenticated fetch against the server: adds auth, a timeout, and central 401 handling. */
  private async rawFetch(path: string, options?: RequestOptions): Promise<Response> {
    if (!this.auth) throw new Error('Not authenticated')
    const { timeoutMs, signal, ...init } = options ?? {}
    const url = `${this.auth.serverUrl}${path}`
    const res = await fetch(url, {
      ...init,
      signal: timeoutSignal(signal ?? undefined, timeoutMs),
      headers: {
        'Authorization': this.authHeader(),
        'Content-Type': 'application/json',
        ...init.headers
      }
    })
    if (res.status === 401) {
      this.handleUnauthorized()
      throw new Error('Session expired')
    }
    return res
  }

  private async request<T>(path: string, options?: RequestOptions): Promise<T> {
    const res = await this.rawFetch(path, options)
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`API error: ${res.status} ${res.statusText} - ${body}`)
    }
    if (res.status === 204) return undefined as T
    const text = await res.text()
    if (!text) return undefined as T
    return JSON.parse(text)
  }

  /** Sessions active in the last 2 minutes (non-admins may only see their own). */
  async getSessions<T = unknown>(): Promise<T[]> {
    return this.request<T[]>('/Sessions?ActiveWithinSeconds=120')
  }

  /** Filter out items with empty/missing names (broken metadata) */
  private sanitizeItems(response: JellyfinItemsResponse): JellyfinItemsResponse {
    const filtered = response.Items.filter(item => item.Name && item.Name.trim() !== '')
    return { Items: filtered, TotalRecordCount: response.TotalRecordCount }
  }

  async authenticate(serverUrl: string, username: string, password: string): Promise<JellyfinAuth> {
    const cleanUrl = serverUrl.replace(/\/+$/, '')
    const url = `${cleanUrl}/Users/AuthenticateByName`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `MediaBrowser Client="${CLIENT_NAME}", Device="${DEVICE_NAME}", DeviceId="${DEVICE_ID}", Version="${CLIENT_VERSION}"`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ Username: username, Pw: password }),
      signal: timeoutSignal()
    })

    if (!res.ok) {
      const message = res.status === 401 ? 'Invalid credentials' : `Error connecting: ${res.status}`
      throw Object.assign(new Error(message), { status: res.status })
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
      const res = await fetch(`${cleanUrl}/System/Info/Public`, { signal: timeoutSignal(undefined, 10_000) })
      return res.ok
    } catch {
      return false
    }
  }

  // --- Library ---

  async getAlbums(startIndex = 0, limit = 100, sortBy = 'SortName', sortOrder = 'Ascending'): Promise<JellyfinItemsResponse> {
    const res = await this.request<JellyfinItemsResponse>(`/Users/${this.userId}/Items?IncludeItemTypes=MusicAlbum&Recursive=true&SortBy=${sortBy}&SortOrder=${sortOrder}&StartIndex=${startIndex}&Limit=${limit}&Fields=PrimaryImageAspectRatio,SortName,BasicSyncInfo,ProductionYear,Genres,AlbumArtist&ImageTypeLimit=1&EnableImageTypes=Primary`)
    return this.sanitizeItems(res)
  }

  async getAlbumItems(albumId: string, signal?: AbortSignal): Promise<JellyfinItemsResponse> {
    return this.request(`/Users/${this.userId}/Items?ParentId=${albumId}&SortBy=ParentIndexNumber,IndexNumber,SortName&Fields=MediaSources,RunTimeTicks,HasLyrics`, { signal })
  }

  async getArtists(startIndex = 0, limit = 100): Promise<JellyfinItemsResponse> {
    const res = await this.request<JellyfinItemsResponse>(`/Artists?StartIndex=${startIndex}&Limit=${limit}&SortBy=SortName&SortOrder=Ascending&Recursive=true&Fields=PrimaryImageAspectRatio,SortName,BasicSyncInfo,AlbumCount,SongCount&UserId=${this.userId}&ImageTypeLimit=1&EnableImageTypes=Primary`)
    return this.sanitizeItems(res)
  }

  async getArtistAlbums(artistId: string, signal?: AbortSignal): Promise<JellyfinItemsResponse> {
    const res = await this.request<JellyfinItemsResponse>(`/Users/${this.userId}/Items?IncludeItemTypes=MusicAlbum&Recursive=true&AlbumArtistIds=${artistId}&SortBy=ProductionYear,SortName&SortOrder=Descending&Fields=PrimaryImageAspectRatio,ProductionYear,Genres`, { signal })
    return this.sanitizeItems(res)
  }

  /** An artist's most played songs ("Popular"). */
  async getArtistTopSongs(artistId: string, limit = 10, signal?: AbortSignal): Promise<JellyfinItem[]> {
    const res = await this.request<JellyfinItemsResponse>(`/Users/${this.userId}/Items?IncludeItemTypes=Audio&Recursive=true&ArtistIds=${artistId}&SortBy=PlayCount,SortName&SortOrder=Descending&Limit=${limit}&Fields=MediaSources,RunTimeTicks,AlbumArtist,Album,AlbumId,Artists,HasLyrics`, { signal })
    return this.sanitizeItems(res).Items
  }

  async getSongs(startIndex = 0, limit = 100, sortBy = 'SortName'): Promise<JellyfinItemsResponse> {
    const res = await this.request<JellyfinItemsResponse>(`/Users/${this.userId}/Items?IncludeItemTypes=Audio&Recursive=true&SortBy=${sortBy}&SortOrder=Ascending&StartIndex=${startIndex}&Limit=${limit}&Fields=MediaSources,RunTimeTicks,AlbumArtist,Album,AlbumId,HasLyrics`)
    return this.sanitizeItems(res)
  }

  /** Returns a server-randomized sample of songs from the whole library ("Shuffle All"). */
  async getRandomSongs(limit = 300): Promise<JellyfinItemsResponse> {
    const res = await this.request<JellyfinItemsResponse>(`/Users/${this.userId}/Items?IncludeItemTypes=Audio&Recursive=true&SortBy=Random&Limit=${limit}&Fields=MediaSources,RunTimeTicks,AlbumArtist,Album,AlbumId,HasLyrics`)
    return this.sanitizeItems(res)
  }

  /**
   * Server-generated "instant mix" of songs similar to a seed item (song, album,
   * or artist), using Jellyfin's own metadata-based radio. Powers the offline
   * fallback for Tocar Mix when Last.fm is unavailable.
   */
  async getInstantMix(itemId: string, limit = 50): Promise<JellyfinItemsResponse> {
    const res = await this.request<JellyfinItemsResponse>(`/Items/${itemId}/InstantMix?UserId=${this.userId}&Limit=${limit}&Fields=MediaSources,RunTimeTicks,AlbumArtist,Album,AlbumId,Artists,HasLyrics`)
    return this.sanitizeItems(res)
  }

  /**
   * Songs in the user's library credited to a given artist name, randomly
   * sampled. Powers artist-level recommendation expansion for the instant mix.
   */
  async getSongsByArtist(artistName: string, limit = 5): Promise<JellyfinItem[]> {
    const res = await this.request<JellyfinItemsResponse>(
      `/Users/${this.userId}/Items?IncludeItemTypes=Audio&Recursive=true&Artists=${encodeURIComponent(artistName)}&SortBy=Random&Limit=${limit}&Fields=MediaSources,RunTimeTicks,AlbumArtist,Album,AlbumId,Artists,HasLyrics`,
    )
    return this.sanitizeItems(res).Items
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

  /** The user's liked (favorite) songs. Jellyfin has no "date liked", so newest-added first. */
  async getFavoriteSongs(signal?: AbortSignal): Promise<JellyfinItemsResponse> {
    const res = await this.request<JellyfinItemsResponse>(`/Users/${this.userId}/Items?IncludeItemTypes=Audio&Recursive=true&Filters=IsFavorite&SortBy=DateCreated,SortName&SortOrder=Descending&Fields=MediaSources,RunTimeTicks,AlbumArtist,Album,AlbumId,Artists,HasLyrics`, { signal })
    return this.sanitizeItems(res)
  }

  async getPlaylistItems(playlistId: string, signal?: AbortSignal): Promise<JellyfinItemsResponse> {
    return this.request(`/Playlists/${playlistId}/Items?UserId=${this.userId}&Fields=MediaSources,RunTimeTicks,AlbumArtist,Album,AlbumId,PlaylistItemId,HasLyrics`, { signal })
  }

  /** A single item (album, artist, playlist, track) for the current user. */
  async getItem(itemId: string, signal?: AbortSignal): Promise<JellyfinItem> {
    return this.request<JellyfinItem>(`/Users/${this.userId}/Items/${encodeURIComponent(itemId)}`, { signal })
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

  async search(query: string, limit = 6, signal?: AbortSignal): Promise<{ albums: JellyfinItem[]; artists: JellyfinItem[]; songs: JellyfinItem[] }> {
    const [albums, artists, songs] = await Promise.all([
      this.request<JellyfinItemsResponse>(`/Users/${this.userId}/Items?SearchTerm=${encodeURIComponent(query)}&IncludeItemTypes=MusicAlbum&Recursive=true&Limit=${limit}&Fields=PrimaryImageAspectRatio,ProductionYear,AlbumArtist`, { signal }),
      this.request<JellyfinItemsResponse>(`/Artists?SearchTerm=${encodeURIComponent(query)}&UserId=${this.userId}&Limit=${limit}&Fields=PrimaryImageAspectRatio`, { signal }),
      this.request<JellyfinItemsResponse>(`/Users/${this.userId}/Items?SearchTerm=${encodeURIComponent(query)}&IncludeItemTypes=Audio&Recursive=true&Limit=${limit}&Fields=RunTimeTicks,AlbumArtist,Album,AlbumId,HasLyrics`, { signal })
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
      this.favoriteChangeListeners.forEach(cb => cb(itemId, false))
    } else {
      await this.request(`/Users/${this.userId}/FavoriteItems/${itemId}`, { method: 'POST' })
      this.favoriteListeners.forEach(cb => cb(itemId))
      this.favoriteChangeListeners.forEach(cb => cb(itemId, true))
    }
  }

  private favoriteChangeListeners = new Set<(itemId: string, isFavorite: boolean) => void>()

  /** Subscribe to likes and unlikes made through this client; returns an unsubscribe function. */
  onFavoriteChanged(cb: (itemId: string, isFavorite: boolean) => void): () => void {
    this.favoriteChangeListeners.add(cb)
    return () => { this.favoriteChangeListeners.delete(cb) }
  }

  private favoriteListeners = new Set<(itemId: string) => void>()

  /** Subscribe to songs being liked through this client; returns an unsubscribe function. */
  onFavoriteAdded(cb: (itemId: string) => void): () => void {
    this.favoriteListeners.add(cb)
    return () => { this.favoriteListeners.delete(cb) }
  }

  async reportPlaybackStart(itemId: string): Promise<void> {
    if (!shouldReportPlays()) return
    await this.request('/Sessions/Playing', {
      method: 'POST',
      body: JSON.stringify({ ItemId: itemId, CanSeek: true })
    })
  }

  async reportPlaybackStopped(itemId: string, positionTicks: number): Promise<void> {
    if (!shouldReportPlays()) return
    await this.request('/Sessions/Playing/Stopped', {
      method: 'POST',
      body: JSON.stringify({ ItemId: itemId, PositionTicks: positionTicks })
    })
  }

  // --- Playlists CRUD ---

  async createPlaylist(name: string, itemIds: string[] = []): Promise<{ Id: string }> {
    const res = await this.request<{ Id: string }>('/Playlists', {
      method: 'POST',
      body: JSON.stringify({ Name: name, Ids: itemIds, UserId: this.userId, MediaType: 'Audio' })
    })
    try {
      await this.setItemOwnerTag(res.Id, this.userId)
    } catch (e) {
      console.warn('Failed to set owner tag on new playlist', e)
    }
    return res
  }

  private ownerTag(userId: string): string {
    return `mp-owner:${userId}`
  }

  private async setItemOwnerTag(itemId: string, userId: string): Promise<void> {
    if ((await this.viaAdminProxy(`/playlists/${itemId}/owner-tag`, { method: 'POST' })).handled) return
    const item = await this.getFullItem(itemId)
    const tag = this.ownerTag(userId)
    const existingTags: string[] = Array.isArray(item.Tags) ? item.Tags : []
    if (existingTags.includes(tag)) return
    // Strip any stale mp-owner tags (a playlist should have a single owner)
    const newTags = existingTags.filter(t => !t.startsWith('mp-owner:'))
    newTags.push(tag)
    item.Tags = newTags
    await this.request(`/Items/${itemId}`, {
      method: 'POST',
      body: JSON.stringify(item)
    })
  }

  /** Whether the logged-in user owns the playlist (mp-owner tag, else the owner-only /Users probe). */
  async isPlaylistOwner(playlistId: string, tags?: string[]): Promise<boolean> {
    const ownerTags = (tags ?? []).filter(t => t.startsWith('mp-owner:'))
    if (ownerTags.length > 0) return ownerTags.includes(this.ownerTag(this.userId))
    try {
      const r = await this.rawFetch(`/Playlists/${playlistId}/Users`)
      return r.status === 200
    } catch {
      return false
    }
  }

  async deleteItem(itemId: string): Promise<void> {
    return this.request(`/Items/${itemId}`, { method: 'DELETE' })
  }

  async renameItem(itemId: string, name: string): Promise<void> {
    const item = await this.getFullItem(itemId)
    item.Name = name
    return this.request(`/Items/${itemId}`, {
      method: 'POST',
      body: JSON.stringify(item)
    })
  }

  async renamePlaylist(playlistId: string, name: string): Promise<void> {
    const r = await this.viaAdminProxy(`/playlists/${playlistId}/name`, { method: 'PUT', body: JSON.stringify({ name }) })
    if (!r.handled) await this.renameItem(playlistId, name)
  }

  async setPlaylistImage(playlistId: string, blob: Blob): Promise<void> {
    const { contentType, data } = await this.encodeImage(blob)
    const r = await this.viaAdminProxy(`/playlists/${playlistId}/image`, { method: 'PUT', body: JSON.stringify({ contentType, data }) })
    if (!r.handled) await this.uploadImageBlob(playlistId, blob)
  }

  async getFullItem(itemId: string): Promise<JellyfinFullItem> {
    return this.request<JellyfinFullItem>(`/Users/${this.userId}/Items/${itemId}`)
  }

  async updateItem(itemId: string, updates: Record<string, unknown>): Promise<void> {
    const item = await this.getFullItem(itemId)
    Object.assign(item, updates)
    return this.request(`/Items/${itemId}`, {
      method: 'POST',
      body: JSON.stringify(item)
    })
  }

  async uploadImage(itemId: string, imageUrl: string): Promise<void> {
    // Download image from URL
    const res = await fetch(imageUrl, { redirect: 'follow', signal: timeoutSignal(undefined, UPLOAD_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`Failed to fetch cover art: ${res.status}`)
    const blob = await res.blob()
    await this.uploadImageBlob(itemId, blob)
  }

  private async encodeImage(blob: Blob): Promise<{ contentType: string; data: string }> {
    const buffer = await blob.arrayBuffer()
    const bytes = new Uint8Array(buffer)

    // Convert to base64 in chunks to avoid call stack overflow
    let base64 = ''
    const chunk = 8192
    for (let i = 0; i < bytes.length; i += chunk) {
      base64 += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    return { contentType: blob.type || 'image/jpeg', data: btoa(base64) }
  }

  async uploadImageBlob(itemId: string, blob: Blob): Promise<void> {
    const { contentType, data: base64 } = await this.encodeImage(blob)
    const uploadRes = await this.rawFetch(`/Items/${itemId}/Images/Primary`, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: base64,
      timeoutMs: UPLOAD_TIMEOUT_MS
    })
    if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`)
  }

  async deleteImage(itemId: string): Promise<void> {
    return this.request(`/Items/${itemId}/Images/Primary`, { method: 'DELETE' })
  }

  async refreshItem(itemId: string): Promise<void> {
    return this.request(`/Items/${itemId}/Refresh?Recursive=true&MetadataRefreshMode=ValidationOnly&ImageRefreshMode=None&ReplaceAllMetadata=false&ReplaceAllImages=false`, {
      method: 'POST'
    })
  }

  /** Starts a full library scan. Resolves false when the server refuses (e.g. non-admin user). */
  async refreshLibrary(): Promise<boolean> {
    const res = await this.rawFetch('/Library/Refresh', { method: 'POST' })
    return res.ok
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

  async getCurrentUser(): Promise<JellyfinUser> {
    return this.request<JellyfinUser>(`/Users/${this.userId}`)
  }

  async updateUserName(name: string): Promise<void> {
    const user = await this.getCurrentUser()
    await this.request(`/Users/${this.userId}`, {
      method: 'POST',
      body: JSON.stringify({ ...user, Name: name })
    })
  }

  async uploadUserImage(blob: Blob): Promise<void> {
    const buffer = await blob.arrayBuffer()
    const bytes = new Uint8Array(buffer)

    let base64 = ''
    const chunk = 8192
    for (let i = 0; i < bytes.length; i += chunk) {
      base64 += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    base64 = btoa(base64)

    const contentType = blob.type || 'image/jpeg'
    const res = await this.rawFetch(`/Users/${this.userId}/Images/Primary`, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: base64,
      timeoutMs: UPLOAD_TIMEOUT_MS
    })
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
  }

  getUserImageUrl(userId: string, imageTag?: string, maxSize = 200): string {
    const tag = imageTag ? `&tag=${imageTag}` : ''
    return `${this.serverUrl}/Users/${userId}/Images/Primary?maxHeight=${maxSize}&maxWidth=${maxSize}${tag}&quality=90&ApiKey=${this.token}`
  }

  async getUserPlaylists(userId: string): Promise<JellyfinItemsResponse> {
    const res = await this.request<{ Items: (JellyfinItem & { Path?: string; Tags?: string[] })[], TotalRecordCount: number }>(
      `/Users/${userId}/Items?IncludeItemTypes=Playlist&Recursive=true&SortBy=SortName&Fields=ChildCount,PrimaryImageAspectRatio,Path,Tags`
    )
    const candidates = res.Items.filter(item => {
      if (!item.Name || item.Name.trim() === '') return false
      const path = item.Path || ''
      if (path.endsWith('.m3u') || path.endsWith('.m3u8')) return false
      return true
    })

    const ownerTag = this.ownerTag(userId)
    const tagged = candidates.filter(item => Array.isArray(item.Tags) && item.Tags.includes(ownerTag))

    // For the logged-in user's own profile, auto-discover (and tag) playlists
    // they own but that haven't been tagged yet (e.g., legacy playlists, or
    // created before this app added tagging). /Playlists/{id}/Users returns
    // 200 only for the owner, 403 otherwise.
    if (userId === this.userId) {
      const untagged = candidates.filter(item => !Array.isArray(item.Tags) || !item.Tags.includes(ownerTag))
      const discovered = await Promise.all(
        untagged.map(async item => {
          // Skip if any mp-owner tag already exists (owned by someone else)
          if (Array.isArray(item.Tags) && item.Tags.some(t => t.startsWith('mp-owner:'))) {
            return null
          }
          try {
            const r = await this.rawFetch(`/Playlists/${item.Id}/Users`)
            return r.status === 200 ? item : null
          } catch {
            return null
          }
        })
      )
      const owned = discovered.filter((i): i is (JellyfinItem & { Path?: string; Tags?: string[] }) => i !== null)
      for (const item of owned) {
        this.setItemOwnerTag(item.Id, this.userId).catch(() => {})
        tagged.push(item)
      }
    }

    return { Items: tagged, TotalRecordCount: tagged.length }
  }

  /**
   * Query the Playback Reporting plugin for individual play events.
   * Returns top played song ItemIds with their play count within the period.
   */
  private async queryPlaybackReport(userId: string, minDate?: string, limit = 100): Promise<{ itemId: string; playCount: number }[]> {
    const proxied = await this.viaAdminProxy<{ items: { itemId: string; playCount: number }[] }>('/stats/top-items', {
      method: 'POST',
      body: JSON.stringify({ userId, minDate, limit })
    })
    if (proxied.handled) return proxied.data.items
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
  async getUserTopArtists(userId: string, limit = 20, minDate?: string, fallbackToAllTime = true): Promise<(JellyfinItem & { periodPlayCount?: number })[]> {
    // All time: fetch top played songs and aggregate by artist
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
    } catch (err) {
      if (!fallbackToAllTime) throw err
      // Fallback: plugin not available
      return this.getUserTopArtists(userId, limit, undefined)
    }
  }

  /**
   * Get top albums for a user within a time period using Playback Reporting plugin.
   * For all-time, uses native Jellyfin PlayCount.
   */
  async getUserTopAlbums(userId: string, limit = 20, minDate?: string, fallbackToAllTime = true): Promise<(JellyfinItem & { periodPlayCount?: number })[]> {
    // All time: fetch top played songs and aggregate by album
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
    } catch (err) {
      if (!fallbackToAllTime) throw err
      // Fallback: plugin not available
      return this.getUserTopAlbums(userId, limit, undefined)
    }
  }

  /**
   * Get top songs for a user within a time period using Playback Reporting plugin.
   * For all-time, uses native Jellyfin PlayCount.
   */
  async getUserTopSongs(userId: string, limit = 20, minDate?: string, fallbackToAllTime = true): Promise<(JellyfinItem & { periodPlayCount?: number })[]> {
    // All time: use native Jellyfin API
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
    } catch (err) {
      if (!fallbackToAllTime) throw err
      // Fallback: plugin not available
      const url = `/Users/${userId}/Items?IncludeItemTypes=Audio&Recursive=true&SortBy=PlayCount&SortOrder=Descending&Limit=${limit}&Fields=RunTimeTicks,AlbumArtist,Album,AlbumId,Artists,HasLyrics&Filters=IsPlayed`
      const res = await this.request<JellyfinItemsResponse>(url)
      return this.sanitizeItems(res).Items
    }
  }

  // --- URLs ---

  getStreamUrl(itemId: string): string {
    const kbps = streamBitrateKbps(useStreamingPrefs.getState().values, this.serverUrl)
    if (kbps === null) return `${this.serverUrl}/Audio/${itemId}/stream?ApiKey=${this.token}&static=true`
    // Universal endpoint: direct-streams sources already under the cap, transcodes the rest to MP3.
    const params = new URLSearchParams({
      UserId: this.userId,
      ApiKey: this.token,
      MaxStreamingBitrate: String(kbps * 1000),
      Container: 'mp3,aac,m4a|aac,m4b|aac,flac,webma,webm|webma,wav,ogg',
      TranscodingContainer: 'mp3',
      TranscodingProtocol: 'http',
      AudioCodec: 'mp3',
    })
    return `${this.serverUrl}/Audio/${itemId}/universal?${params}`
  }

  getImageUrl(itemId: string, imageTag?: string, maxSize = 300): string {
    const tag = imageTag ? `&tag=${imageTag}` : ''
    return `${this.serverUrl}/Items/${itemId}/Images/Primary?maxHeight=${maxSize}&maxWidth=${maxSize}${tag}&quality=90&ApiKey=${this.token}`
  }

  getDownloadUrl(itemId: string): string {
    const quality = useStreamingPrefs.getState().values.downloadQuality
    if (quality === 'mp3-320') return `${this.serverUrl}/Audio/${itemId}/stream.mp3?ApiKey=${this.token}&audioCodec=mp3&audioBitRate=320000`
    if (quality === 'aac-256') return `${this.serverUrl}/Audio/${itemId}/stream.aac?ApiKey=${this.token}&audioCodec=aac&audioBitRate=256000`
    return `${this.serverUrl}/Items/${itemId}/Download?ApiKey=${this.token}`
  }

  async getLyrics(itemId: string): Promise<{ Text: string; Start?: number }[]> {
    // Try Jellyfin embedded lyrics first
    try {
      const res = await this.rawFetch(`/Audio/${itemId}/Lyrics`)
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
        headers: { 'User-Agent': 'JellyfinMusicPlayer/1.0.0' },
        signal: timeoutSignal()
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
      const ticks = (min * 60 + sec + ms / 1000) * TICKS_PER_SECOND
      const text = match[4].trim()
      if (text) lines.push({ Text: text, Start: ticks })
    }
  }
  return lines
}

export const jellyfin = new JellyfinService()
