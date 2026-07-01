import { contextBridge, ipcRenderer } from 'electron'
import type {
  PlatformApi,
  DownloadProgress,
  DownloadComplete,
  DownloadError,
  UpdateAvailable,
  UpdateProgress,
  LastfmTrack,
} from '@music-player/core/platform'

const api = {
  // Platform (ex.: 'darwin', 'win32', 'linux')
  platform: process.platform,

  // Auth
  getAuth: () => ipcRenderer.invoke('db:get-auth'),
  saveAuth: (data: { serverUrl: string; token: string; userId: string; username: string; serverId: string }) =>
    ipcRenderer.invoke('db:save-auth', data),
  clearAuth: () => ipcRenderer.invoke('db:clear-auth'),

  // Downloads
  startDownload: (data: { itemId: string; url: string; filename: string; metadata: string }) =>
    ipcRenderer.invoke('download:start', data),
  removeDownload: (itemId: string) => ipcRenderer.invoke('download:remove', itemId),
  listDownloads: () => ipcRenderer.invoke('download:list'),
  getDownload: (itemId: string) => ipcRenderer.invoke('download:get', itemId),
  getDownloadPath: (itemId: string) => ipcRenderer.invoke('download:get-path', itemId),

  // Collage export (saves a PNG to the OS Downloads folder)
  saveCollage: (data: { bytes: Uint8Array; filename: string }) =>
    ipcRenderer.invoke('collage:save', data),

  // Audio Cache
  cacheAudio: (data: { itemId: string; url: string; quality: string }) =>
    ipcRenderer.invoke('cache:audio:save', data),
  getCachedAudio: (itemId: string) => ipcRenderer.invoke('cache:audio:get', itemId),
  clearCache: () => ipcRenderer.invoke('cache:clear'),

  // Settings
  getSetting: (key: string) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),

  // Last.fm scrobbling
  lastfmGetStatus: () => ipcRenderer.invoke('lastfm:get-status'),
  lastfmSetCredentials: (apiKey: string, apiSecret: string) => ipcRenderer.invoke('lastfm:set-credentials', apiKey, apiSecret),
  lastfmSetEnabled: (enabled: boolean) => ipcRenderer.invoke('lastfm:set-enabled', enabled),
  lastfmStartAuth: () => ipcRenderer.invoke('lastfm:start-auth'),
  lastfmFinishAuth: (token: string) => ipcRenderer.invoke('lastfm:finish-auth', token),
  lastfmDisconnect: () => ipcRenderer.invoke('lastfm:disconnect'),
  lastfmNowPlaying: (track: LastfmTrack) => ipcRenderer.invoke('lastfm:now-playing', track),
  lastfmScrobble: (track: LastfmTrack) => ipcRenderer.invoke('lastfm:scrobble', track),
  lastfmGetSimilarTracks: (track: { artist: string; track: string }, limit?: number) => ipcRenderer.invoke('lastfm:get-similar-tracks', track, limit),

  // Lyrics Cache
  getCachedLyrics: (itemId: string) => ipcRenderer.invoke('lyrics:get', itemId),
  saveLyrics: (itemId: string, lyrics: string) => ipcRenderer.invoke('lyrics:save', itemId, lyrics),

  // Downloaded Lyrics (persistent, for offline)
  getDownloadedLyrics: (itemId: string) => ipcRenderer.invoke('lyrics:get-downloaded', itemId),
  saveDownloadedLyrics: (itemId: string, lyrics: string) => ipcRenderer.invoke('lyrics:save-downloaded', itemId, lyrics),

  // File access
  getFileUrl: (filePath: string) => ipcRenderer.invoke('file:get-url', filePath),

  // Event listeners
  onDownloadProgress: (cb: (data: DownloadProgress) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: DownloadProgress) => cb(data)
    ipcRenderer.on('download:progress', handler)
    return () => ipcRenderer.removeListener('download:progress', handler)
  },
  onDownloadComplete: (cb: (data: DownloadComplete) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: DownloadComplete) => cb(data)
    ipcRenderer.on('download:complete', handler)
    return () => ipcRenderer.removeListener('download:complete', handler)
  },
  onDownloadError: (cb: (data: DownloadError) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: DownloadError) => cb(data)
    ipcRenderer.on('download:error', handler)
    return () => ipcRenderer.removeListener('download:error', handler)
  },

  // Auto-updater
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  onUpdateAvailable: (cb: (data: UpdateAvailable) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: UpdateAvailable) => cb(data)
    ipcRenderer.on('updater:update-available', handler)
    return () => ipcRenderer.removeListener('updater:update-available', handler)
  },
  onUpdateDownloadProgress: (cb: (data: UpdateProgress) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: UpdateProgress) => cb(data)
    ipcRenderer.on('updater:download-progress', handler)
    return () => ipcRenderer.removeListener('updater:download-progress', handler)
  },
  onUpdateDownloaded: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('updater:update-downloaded', handler)
    return () => ipcRenderer.removeListener('updater:update-downloaded', handler)
  },
  onUpdateError: (cb: (error: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, error: string) => cb(error)
    ipcRenderer.on('updater:error', handler)
    return () => ipcRenderer.removeListener('updater:error', handler)
  }
} satisfies PlatformApi

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
