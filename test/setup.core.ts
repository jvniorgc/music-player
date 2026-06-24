import '@testing-library/jest-dom/vitest'
import { vi, beforeEach, afterEach } from 'vitest'
import type { PlatformApi } from '@music-player/core/platform'

// A fresh, fully-stubbed `window.api` (the PlatformApi bridge) for every test.
// Individual tests can override specific methods, e.g.
//   vi.mocked(window.api.getDownloadPath).mockResolvedValue('/x.audio')
export function makeApiStub(): PlatformApi {
  return {
    // Auth
    getAuth: vi.fn().mockResolvedValue(null),
    saveAuth: vi.fn().mockResolvedValue(undefined),
    clearAuth: vi.fn().mockResolvedValue(undefined),
    // Downloads
    startDownload: vi.fn().mockResolvedValue({ success: true }),
    removeDownload: vi.fn().mockResolvedValue(undefined),
    listDownloads: vi.fn().mockResolvedValue([]),
    getDownload: vi.fn().mockResolvedValue(null),
    getDownloadPath: vi.fn().mockResolvedValue(null),
    // Collage
    saveCollage: vi.fn().mockResolvedValue({ success: true }),
    // Audio cache
    cacheAudio: vi.fn().mockResolvedValue({ success: true }),
    getCachedAudio: vi.fn().mockResolvedValue(null),
    clearCache: vi.fn().mockResolvedValue(undefined),
    // Settings
    getSetting: vi.fn().mockResolvedValue(null),
    setSetting: vi.fn().mockResolvedValue(undefined),
    // Last.fm
    lastfmGetStatus: vi.fn().mockResolvedValue({ configured: false, connected: false, enabled: false, username: null }),
    lastfmSetCredentials: vi.fn().mockResolvedValue(undefined),
    lastfmSetEnabled: vi.fn().mockResolvedValue(undefined),
    lastfmStartAuth: vi.fn().mockResolvedValue({ token: 'tok' }),
    lastfmFinishAuth: vi.fn().mockResolvedValue({ username: 'me' }),
    lastfmDisconnect: vi.fn().mockResolvedValue(undefined),
    lastfmNowPlaying: vi.fn().mockResolvedValue(undefined),
    lastfmScrobble: vi.fn().mockResolvedValue(undefined),
    // Lyrics
    getCachedLyrics: vi.fn().mockResolvedValue(null),
    saveLyrics: vi.fn().mockResolvedValue(undefined),
    getDownloadedLyrics: vi.fn().mockResolvedValue(null),
    saveDownloadedLyrics: vi.fn().mockResolvedValue(undefined),
    // Files
    getFileUrl: vi.fn().mockResolvedValue(''),
    // Download events
    onDownloadProgress: vi.fn().mockReturnValue(() => {}),
    onDownloadComplete: vi.fn().mockReturnValue(() => {}),
    onDownloadError: vi.fn().mockReturnValue(() => {}),
    // Updater
    checkForUpdates: vi.fn().mockResolvedValue(null),
    downloadUpdate: vi.fn().mockResolvedValue(undefined),
    installUpdate: vi.fn().mockResolvedValue(undefined),
    onUpdateAvailable: vi.fn().mockReturnValue(() => {}),
    onUpdateDownloadProgress: vi.fn().mockReturnValue(() => {}),
    onUpdateDownloaded: vi.fn().mockReturnValue(() => {}),
    onUpdateError: vi.fn().mockReturnValue(() => {}),
  }
}

beforeEach(() => {
  ;(window as unknown as { api: PlatformApi }).api = makeApiStub()
})

afterEach(() => {
  // Clear call history between tests but preserve implementations defined in
  // vi.mock() factories. (restoreAllMocks would strip mockResolvedValue/etc.)
  vi.clearAllMocks()
})
