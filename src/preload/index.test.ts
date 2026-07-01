import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ElectronAPI } from './index'

const h = vi.hoisted(() => ({
  exposed: undefined as unknown,
  exposeKey: '',
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn()
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, value: unknown) => {
      h.exposeKey = key
      h.exposed = value
    }
  },
  ipcRenderer: { invoke: h.invoke, on: h.on, removeListener: h.removeListener }
}))

// Importing the preload module runs contextBridge.exposeInMainWorld('api', api).
await import('./index')
const api = h.exposed as ElectronAPI

beforeEach(() => {
  h.invoke.mockReset()
  h.on.mockReset()
  h.removeListener.mockReset()
})

describe('preload bridge', () => {
  it('exposes the api under the "api" key', () => {
    expect(h.exposeKey).toBe('api')
    expect(api).toBeTypeOf('object')
  })

  it('maps simple invoke methods to their channels', () => {
    api.getAuth()
    expect(h.invoke).toHaveBeenCalledWith('db:get-auth')

    api.clearAuth()
    expect(h.invoke).toHaveBeenCalledWith('db:clear-auth')

    api.listDownloads()
    expect(h.invoke).toHaveBeenCalledWith('download:list')

    api.clearCache()
    expect(h.invoke).toHaveBeenCalledWith('cache:clear')

    api.checkForUpdates()
    expect(h.invoke).toHaveBeenCalledWith('updater:check')
  })

  it('forwards arguments to invoke', () => {
    const auth = { serverUrl: 's', token: 't', userId: 'u', username: 'n', serverId: 'sid' }
    api.saveAuth(auth)
    expect(h.invoke).toHaveBeenCalledWith('db:save-auth', auth)

    api.startDownload({ itemId: 'i', url: 'u', filename: 'f', metadata: 'm' })
    expect(h.invoke).toHaveBeenCalledWith('download:start', { itemId: 'i', url: 'u', filename: 'f', metadata: 'm' })

    api.setSetting('k', 'v')
    expect(h.invoke).toHaveBeenCalledWith('settings:set', 'k', 'v')

    api.saveLyrics('id', 'lrc')
    expect(h.invoke).toHaveBeenCalledWith('lyrics:save', 'id', 'lrc')

    api.cacheAudio({ itemId: 'i', url: 'u', quality: 'hi' })
    expect(h.invoke).toHaveBeenCalledWith('cache:audio:save', { itemId: 'i', url: 'u', quality: 'hi' })

    api.getFileUrl('/path')
    expect(h.invoke).toHaveBeenCalledWith('file:get-url', '/path')
  })

  it('maps the remaining invoke methods to their channels', () => {
    api.removeDownload('i1')
    expect(h.invoke).toHaveBeenCalledWith('download:remove', 'i1')

    api.getDownload('i1')
    expect(h.invoke).toHaveBeenCalledWith('download:get', 'i1')

    api.getDownloadPath('i1')
    expect(h.invoke).toHaveBeenCalledWith('download:get-path', 'i1')

    const collage = { bytes: new Uint8Array([1]), filename: 'c.png' }
    api.saveCollage(collage)
    expect(h.invoke).toHaveBeenCalledWith('collage:save', collage)

    api.getCachedAudio('i1')
    expect(h.invoke).toHaveBeenCalledWith('cache:audio:get', 'i1')

    api.getSetting('k')
    expect(h.invoke).toHaveBeenCalledWith('settings:get', 'k')

    api.getCachedLyrics('i1')
    expect(h.invoke).toHaveBeenCalledWith('lyrics:get', 'i1')

    api.getDownloadedLyrics('i1')
    expect(h.invoke).toHaveBeenCalledWith('lyrics:get-downloaded', 'i1')

    api.saveDownloadedLyrics('i1', 'lrc')
    expect(h.invoke).toHaveBeenCalledWith('lyrics:save-downloaded', 'i1', 'lrc')

    api.downloadUpdate()
    expect(h.invoke).toHaveBeenCalledWith('updater:download')

    api.installUpdate()
    expect(h.invoke).toHaveBeenCalledWith('updater:install')
  })

  it('maps the Last.fm methods to their channels', () => {
    api.lastfmGetStatus()
    expect(h.invoke).toHaveBeenCalledWith('lastfm:get-status')

    api.lastfmSetCredentials('key', 'secret')
    expect(h.invoke).toHaveBeenCalledWith('lastfm:set-credentials', 'key', 'secret')

    api.lastfmSetEnabled(true)
    expect(h.invoke).toHaveBeenCalledWith('lastfm:set-enabled', true)

    api.lastfmStartAuth()
    expect(h.invoke).toHaveBeenCalledWith('lastfm:start-auth')

    api.lastfmFinishAuth('tok')
    expect(h.invoke).toHaveBeenCalledWith('lastfm:finish-auth', 'tok')

    api.lastfmDisconnect()
    expect(h.invoke).toHaveBeenCalledWith('lastfm:disconnect')

    const track = { artist: 'A', track: 'B' }
    api.lastfmNowPlaying(track)
    expect(h.invoke).toHaveBeenCalledWith('lastfm:now-playing', track)

    api.lastfmScrobble({ ...track, timestamp: 1 })
    expect(h.invoke).toHaveBeenCalledWith('lastfm:scrobble', { ...track, timestamp: 1 })

    api.lastfmGetSimilarTracks({ artist: 'A', track: 'B' }, 5)
    expect(h.invoke).toHaveBeenCalledWith('lastfm:get-similar-tracks', { artist: 'A', track: 'B' }, 5)
  })

  it('wires download:progress listeners and returns an unsubscribe', () => {
    const cb = vi.fn()
    const unsub = api.onDownloadProgress(cb)
    expect(h.on).toHaveBeenCalledWith('download:progress', expect.any(Function))

    // The registered handler strips the IpcRenderer event and forwards the payload.
    const handler = h.on.mock.calls[0][1] as (e: unknown, d: unknown) => void
    handler({}, { itemId: 'x', progress: 0.5 })
    expect(cb).toHaveBeenCalledWith({ itemId: 'x', progress: 0.5 })

    unsub()
    expect(h.removeListener).toHaveBeenCalledWith('download:progress', handler)
  })

  it('wires the remaining event listeners to their channels', () => {
    const channels: [keyof ElectronAPI, string][] = [
      ['onDownloadComplete', 'download:complete'],
      ['onDownloadError', 'download:error'],
      ['onUpdateAvailable', 'updater:update-available'],
      ['onUpdateDownloadProgress', 'updater:download-progress'],
      ['onUpdateDownloaded', 'updater:update-downloaded'],
      ['onUpdateError', 'updater:error']
    ]
    for (const [method, channel] of channels) {
      h.on.mockClear()
      h.removeListener.mockClear()
      const cb = vi.fn()
      const unsub = (api[method] as (cb: (...a: any[]) => void) => () => void)(cb)
      expect(h.on).toHaveBeenCalledWith(channel, expect.any(Function))
      // Invoking the registered handler forwards the payload to the callback.
      const handler = h.on.mock.calls[0][1] as (e: unknown, d: unknown) => void
      handler({}, { ok: true })
      expect(cb).toHaveBeenCalled()
      unsub()
      expect(h.removeListener).toHaveBeenCalledWith(channel, expect.any(Function))
    }
  })
})
