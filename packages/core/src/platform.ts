// Platform contract shared by all clients (desktop/Electron, mobile/Capacitor).
// Each client provides an implementation exposed as `window.api`.

export type DownloadProgress = { itemId: string; progress: number }
export type DownloadComplete = { itemId: string }
export type DownloadError = { itemId: string; error: string }
export type UpdateAvailable = { version: string; releaseNotes: string | undefined }
export type UpdateProgress = { percent: number; bytesPerSecond: number; transferred: number; total: number }

export type LastfmStatus = {
  /** Both API key and shared secret are stored. */
  configured: boolean
  /** A user session key is stored (account linked). */
  connected: boolean
  /** Scrobbling toggle is enabled. */
  enabled: boolean
  /** The linked Last.fm username, when connected. */
  username: string | null
}

export type LastfmTrack = {
  artist: string
  track: string
  album?: string
  albumArtist?: string
  /** Track length in seconds. */
  duration?: number
  /** Unix epoch seconds of when playback started (required for scrobble). */
  timestamp?: number
}

export type LastfmSimilarTrack = {
  artist: string
  track: string
  /** Similarity score in the 0..1 range as reported by Last.fm. */
  match: number
}

export type LastfmInfoMethod = 'album.getInfo' | 'track.getInfo' | 'artist.getInfo'

/** What the player is doing, pushed to Discord Rich Presence. Never include server URLs/tokens. */
export type DiscordPresence = {
  title: string
  artist: string
  album?: string
  /** Current playback position in seconds. */
  position: number
  /** Track length in seconds (0 if unknown). */
  duration: number
}

export type AuthData = {
  serverUrl: string
  token: string
  userId: string
  username: string
  serverId: string
}

export type AuthRecord = {
  server_url: string
  token: string
  user_id: string
  username: string
  server_id: string
}

export type DownloadRecord = {
  item_id: string
  file_path: string
  filename: string
  metadata: string
  status: string
  file_size?: number
}

/**
 * The full native surface the UI relies on. The desktop client implements this
 * over Electron IPC; the mobile client implements it over Capacitor plugins.
 */
export interface PlatformApi {
  /** Host OS identifier (e.g. 'darwin', 'win32', 'linux'). */
  platform: string

  // Auth
  getAuth: () => Promise<AuthRecord | null>
  saveAuth: (data: AuthData) => Promise<void>
  clearAuth: () => Promise<void>

  // Downloads
  startDownload: (data: { itemId: string; url: string; filename: string; metadata: string }) => Promise<{ success: boolean; error?: string }>
  removeDownload: (itemId: string) => Promise<void>
  listDownloads: () => Promise<DownloadRecord[]>
  getDownload: (itemId: string) => Promise<DownloadRecord | null>
  getDownloadPath: (itemId: string) => Promise<string | null>

  // Collage export
  saveCollage: (data: { bytes: Uint8Array; filename: string }) => Promise<{ success: boolean; path?: string; error?: string }>

  // Audio cache
  cacheAudio: (data: { itemId: string; url: string; quality: string }) => Promise<{ success: boolean; error?: string }>
  getCachedAudio: (itemId: string) => Promise<string | null>
  clearCache: () => Promise<void>
  getAppVersion: () => Promise<string>

  // Settings
  getSetting: (key: string) => Promise<string | null>
  setSetting: (key: string, value: string) => Promise<void>

  // Last.fm scrobbling
  lastfmGetStatus: () => Promise<LastfmStatus>
  lastfmSetCredentials: (apiKey: string, apiSecret: string) => Promise<void>
  lastfmSetEnabled: (enabled: boolean) => Promise<void>
  /** Begin desktop auth: requests a token and opens the authorize page in the browser. */
  lastfmStartAuth: () => Promise<{ token: string }>
  /** Exchange an authorized token for a permanent session key; returns the username. */
  lastfmFinishAuth: (token: string) => Promise<{ username: string }>
  lastfmDisconnect: () => Promise<void>
  lastfmNowPlaying: (track: LastfmTrack) => Promise<void>
  lastfmScrobble: (track: LastfmTrack) => Promise<void>
  /** Similar-track recommendations for a seed (Last.fm track.getSimilar; needs only the API key). */
  lastfmGetSimilarTracks: (track: { artist: string; track: string }, limit?: number) => Promise<LastfmSimilarTrack[]>
  /** Raw Last.fm `*.getInfo` JSON (API key only; adds the linked username). Null if unconfigured / not found. */
  lastfmGetInfo: (method: LastfmInfoMethod, params: Record<string, string>) => Promise<Record<string, unknown> | null>

  // Discord Rich Presence
  discordGetEnabled: () => Promise<boolean>
  discordSetEnabled: (enabled: boolean) => Promise<void>
  /** Show the given track on Discord, or clear it with null (pause/stop). */
  discordSetActivity: (presence: DiscordPresence | null) => Promise<void>

  // Lyrics cache (session)
  getCachedLyrics: (itemId: string) => Promise<string | null>
  saveLyrics: (itemId: string, lyrics: string) => Promise<void>

  // Downloaded lyrics (persistent, offline)
  getDownloadedLyrics: (itemId: string) => Promise<string | null>
  saveDownloadedLyrics: (itemId: string, lyrics: string) => Promise<void>

  /** Optional: allow cross-origin requests to a user-configured server (desktop CORS allowlist). */
  allowOrigin?: (url: string) => Promise<void>

  // File access
  /** Playable URL for a cached/downloaded file inside the app's own dirs; null otherwise. */
  getFileUrl: (filePath: string) => Promise<string | null>

  // Download event listeners (return an unsubscribe function)
  onDownloadProgress: (cb: (data: DownloadProgress) => void) => () => void
  onDownloadComplete: (cb: (data: DownloadComplete) => void) => () => void
  onDownloadError: (cb: (data: DownloadError) => void) => () => void

  // Auto-updater
  checkForUpdates: () => Promise<unknown>
  downloadUpdate: () => Promise<unknown>
  installUpdate: () => Promise<unknown>
  onUpdateAvailable: (cb: (data: UpdateAvailable) => void) => () => void
  onUpdateDownloadProgress: (cb: (data: UpdateProgress) => void) => () => void
  onUpdateDownloaded: (cb: () => void) => () => void
  onUpdateError: (cb: (error: string) => void) => () => void

  // System integration (desktop only; optional so other clients can omit it)
  systemGetSettings?: () => Promise<SystemSettingsState>
  systemSetSettings?: (patch: Partial<SystemSettings>) => Promise<SystemSettingsState>
  /** Restart the app (e.g. to apply the hardware-acceleration setting). */
  systemRelaunch?: () => Promise<void>
  /** Localized labels for the tray context menu. */
  systemSetTrayLabels?: (labels: TrayLabels) => Promise<void>
  onTrayCommand?: (cb: (command: TrayCommand) => void) => () => void
}

export interface SystemSettings {
  launchAtLogin: boolean
  startMinimized: boolean
  /** Closing the window hides it to the tray instead of quitting. */
  closeToTray: boolean
  hardwareAcceleration: boolean
}

export interface SystemSettingsState extends SystemSettings {
  /** A saved setting only applies after relaunching the app. */
  restartRequired: boolean
}

export interface TrayLabels {
  playPause: string
  next: string
  previous: string
  show: string
  quit: string
}

export type TrayCommand = 'playpause' | 'next' | 'previous'
