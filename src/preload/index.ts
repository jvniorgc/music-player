import { contextBridge, ipcRenderer } from 'electron'

export type DownloadProgress = { itemId: string; progress: number }
export type DownloadComplete = { itemId: string }
export type DownloadError = { itemId: string; error: string }

const api = {
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

  // Audio Cache
  cacheAudio: (data: { itemId: string; url: string; quality: string }) =>
    ipcRenderer.invoke('cache:audio:save', data),
  getCachedAudio: (itemId: string) => ipcRenderer.invoke('cache:audio:get', itemId),
  clearCache: () => ipcRenderer.invoke('cache:clear'),

  // Settings
  getSetting: (key: string) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),

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
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
