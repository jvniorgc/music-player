import '@testing-library/jest-dom/vitest'
import { vi, beforeEach, afterEach } from 'vitest'
import type { PlatformApi } from '@music-player/core/platform'
import { useI18nStore } from '@music-player/core/i18n'

// A fresh, fully-stubbed `window.api` (the PlatformApi bridge) for every test.
// Individual tests can override specific methods, e.g.
//   vi.mocked(window.api.getDownloadPath).mockResolvedValue('/x.audio')
export function makeApiStub(): PlatformApi {
  return {
    platform: 'linux',
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
    getAppVersion: vi.fn().mockResolvedValue('0.0.0-test'),
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
    lastfmGetSimilarTracks: vi.fn().mockResolvedValue([]),
    lastfmGetInfo: vi.fn().mockResolvedValue(null),
    // Discord
    discordGetEnabled: vi.fn().mockResolvedValue(false),
    discordSetEnabled: vi.fn().mockResolvedValue(undefined),
    discordSetActivity: vi.fn().mockResolvedValue(undefined),
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
    // Global shortcuts / window
    setGlobalShortcuts: vi.fn().mockResolvedValue({ failed: [] }),
    onGlobalShortcut: vi.fn().mockReturnValue(() => {}),
    focusWindow: vi.fn().mockResolvedValue(undefined),
  }
}

beforeEach(() => {
  ;(window as unknown as { api: PlatformApi }).api = makeApiStub()
  // UI text assertions are written in English; render with `en` unless a test opts in.
  useI18nStore.setState({ preference: 'system', locale: 'en' })
})

afterEach(() => {
  // Clear call history between tests but preserve implementations defined in
  // vi.mock() factories. (restoreAllMocks would strip mockResolvedValue/etc.)
  vi.clearAllMocks()
})
