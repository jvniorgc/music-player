import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'

const h = vi.hoisted(() => {
  const listeners = new Map<string, ((p?: any) => void)[]>()
  return {
    handlers: new Map<string, (...a: any[]) => any>(),
    window: { webContents: { send: vi.fn() } },
    updater: {
      autoDownload: true,
      autoInstallOnAppQuit: false,
      on(ev: string, cb: (p?: any) => void) {
        const arr = listeners.get(ev) ?? []
        arr.push(cb)
        listeners.set(ev, arr)
        return this
      },
      emit(ev: string, payload?: any) {
        for (const cb of listeners.get(ev) ?? []) cb(payload)
      },
      checkForUpdates: vi.fn(async () => ({ updateInfo: null })),
      downloadUpdate: vi.fn(),
      quitAndInstall: vi.fn()
    }
  }
})

vi.mock('electron-updater', () => ({ autoUpdater: h.updater }))
vi.mock('electron', () => ({
  ipcMain: { handle: (ch: string, cb: (...a: any[]) => any) => h.handlers.set(ch, cb) },
  BrowserWindow: class {}
}))

beforeAll(async () => {
  vi.useFakeTimers()
  const { initAutoUpdater } = await import('./updater')
  initAutoUpdater(h.window as any)
})

afterAll(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  h.window.webContents.send.mockClear()
  h.updater.checkForUpdates.mockClear()
  h.updater.downloadUpdate.mockClear()
  h.updater.quitAndInstall.mockClear()
})

describe('initAutoUpdater', () => {
  it('configures manual download and install-on-quit', () => {
    expect(h.updater.autoDownload).toBe(false)
    expect(h.updater.autoInstallOnAppQuit).toBe(true)
  })

  it('forwards update-available with version and release notes', () => {
    h.updater.emit('update-available', { version: '2.0.0', releaseNotes: 'notes' })
    expect(h.window.webContents.send).toHaveBeenCalledWith('updater:update-available', { version: '2.0.0', releaseNotes: 'notes' })
  })

  it('forwards update-not-available', () => {
    h.updater.emit('update-not-available')
    expect(h.window.webContents.send).toHaveBeenCalledWith('updater:no-update')
  })

  it('forwards download progress', () => {
    h.updater.emit('download-progress', { percent: 50, bytesPerSecond: 100, transferred: 5, total: 10 })
    expect(h.window.webContents.send).toHaveBeenCalledWith('updater:download-progress', { percent: 50, bytesPerSecond: 100, transferred: 5, total: 10 })
  })

  it('forwards update-downloaded and error events', () => {
    h.updater.emit('update-downloaded')
    expect(h.window.webContents.send).toHaveBeenCalledWith('updater:update-downloaded')
    h.updater.emit('error', new Error('kaboom'))
    expect(h.window.webContents.send).toHaveBeenCalledWith('updater:error', 'kaboom')
  })

  it('updater:check returns updateInfo on success and null on failure', async () => {
    h.updater.checkForUpdates.mockResolvedValueOnce({ updateInfo: { version: '3.1.0' } })
    expect(await h.handlers.get('updater:check')!()).toEqual({ version: '3.1.0' })

    h.updater.checkForUpdates.mockResolvedValueOnce(null)
    expect(await h.handlers.get('updater:check')!()).toBeNull()

    h.updater.checkForUpdates.mockRejectedValueOnce(new Error('offline'))
    expect(await h.handlers.get('updater:check')!()).toBeNull()
  })

  it('updater:download and updater:install delegate to the auto-updater', () => {
    h.handlers.get('updater:download')!()
    expect(h.updater.downloadUpdate).toHaveBeenCalled()

    h.handlers.get('updater:install')!()
    expect(h.updater.quitAndInstall).toHaveBeenCalledWith(false, true)
  })

  it('checks for updates after the startup delay', () => {
    vi.advanceTimersByTime(3000)
    expect(h.updater.checkForUpdates).toHaveBeenCalled()
  })
})
