import { autoUpdater, UpdateInfo } from 'electron-updater'
import { BrowserWindow, ipcMain } from 'electron'

let mainWindow: BrowserWindow | null = null

export function initAutoUpdater(window: BrowserWindow) {
  mainWindow = window

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    mainWindow?.webContents.send('updater:update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes
    })
  })

  autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('updater:no-update')
  })

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('updater:download-progress', {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    })
  })

  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send('updater:update-downloaded')
  })

  autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('updater:error', err.message)
  })

  // IPC handlers
  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      return result?.updateInfo ?? null
    } catch {
      return null
    }
  })

  ipcMain.handle('updater:download', () => {
    autoUpdater.downloadUpdate()
  })

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall(false, true)
  })

  // Check for updates after a short delay
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 3000)
}
