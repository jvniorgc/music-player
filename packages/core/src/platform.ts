// Platform contract shared by all clients (desktop/Electron, mobile/Capacitor).
// Each client provides an implementation exposed as `window.api`.

export type DownloadProgress = { itemId: string; progress: number }
export type DownloadComplete = { itemId: string }
export type DownloadError = { itemId: string; error: string }
export type UpdateAvailable = { version: string; releaseNotes: string | undefined }
export type UpdateProgress = { percent: number; bytesPerSecond: number; transferred: number; total: number }

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

  // Settings
  getSetting: (key: string) => Promise<string | null>
  setSetting: (key: string, value: string) => Promise<void>

  // Lyrics cache (session)
  getCachedLyrics: (itemId: string) => Promise<string | null>
  saveLyrics: (itemId: string, lyrics: string) => Promise<void>

  // Downloaded lyrics (persistent, offline)
  getDownloadedLyrics: (itemId: string) => Promise<string | null>
  saveDownloadedLyrics: (itemId: string, lyrics: string) => Promise<void>

  // File access
  getFileUrl: (filePath: string) => Promise<string>

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
}
