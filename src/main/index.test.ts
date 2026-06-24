import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// Shared state captured by the electron mock (hoisted so the vi.mock factory can see it).
const h = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  appHandlers: new Map<string, (...args: any[]) => any>(),
  sent: [] as { channel: string; data: unknown }[],
  paths: { userData: '', downloads: '' },
  windowOpenHandler: null as null | ((d: { url: string }) => unknown),
  protocolHandler: null as null | ((req: { url: string }) => unknown),
  netFetch: null as null | ReturnType<typeof vi.fn>
}))

vi.mock('electron', () => {
  class BrowserWindow {
    webContents = {
      setWindowOpenHandler: (cb: (d: { url: string }) => unknown) => { h.windowOpenHandler = cb },
      send: (channel: string, data: unknown) => h.sent.push({ channel, data })
    }
    loadURL = vi.fn()
    loadFile = vi.fn()
    on = vi.fn()
    static getAllWindows = () => [] as unknown[]
  }
  const netFetch = vi.fn(async () => new Response(null, { status: 200 }))
  h.netFetch = netFetch
  return {
    app: {
      getPath: (name: string) => (name === 'downloads' ? h.paths.downloads : h.paths.userData),
      commandLine: { appendSwitch: vi.fn() },
      whenReady: () => Promise.resolve(),
      on: (event: string, cb: (...a: any[]) => any) => h.appHandlers.set(event, cb),
      quit: vi.fn()
    },
    BrowserWindow,
    ipcMain: { handle: (channel: string, cb: (...a: any[]) => any) => h.handlers.set(channel, cb) },
    shell: { openExternal: vi.fn() },
    session: { defaultSession: { protocol: { handle: (_scheme: string, cb: (req: { url: string }) => unknown) => { h.protocolHandler = cb } } } },
    net: { fetch: netFetch },
    Menu: { setApplicationMenu: vi.fn() }
  }
})

vi.mock('./updater', () => ({ initAutoUpdater: vi.fn() }))

let tmpRoot = ''
let getDatabase: typeof import('./database')['getDatabase']

// Invoke a captured IPC handler with the conventional (event, ...args) shape.
function invoke(channel: string, ...args: unknown[]) {
  const cb = h.handlers.get(channel)
  if (!cb) throw new Error(`No handler registered for ${channel}`)
  return cb({}, ...args)
}

function byteResponse(bytes: Uint8Array, status = 200) {
  return new Response(status >= 200 && status < 300 ? bytes : null, { status })
}

// download:start returns before its write stream finishes flushing to disk.
const flushDisk = () => new Promise(r => setTimeout(r, 30))

beforeAll(async () => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'mp-main-'))
  h.paths.userData = join(tmpRoot, 'userData')
  h.paths.downloads = join(tmpRoot, 'downloads')
  // app.getPath('downloads') must point at an existing dir for collage:save.
  mkdirSync(h.paths.userData, { recursive: true })
  mkdirSync(h.paths.downloads, { recursive: true })

  // Pre-seed the session audio-cache dir so the startup clearSessionCaches()
  // exercises both the unlink loop and its catch (unlinking a directory throws).
  const audioCacheDir = join(h.paths.userData, 'cache', 'audio')
  mkdirSync(audioCacheDir, { recursive: true })
  writeFileSync(join(audioCacheDir, 'stale.bin'), 'old')
  mkdirSync(join(audioCacheDir, 'adir'), { recursive: true })

  // Renderer dev URL must be unset so createWindow() takes the loadFile() branch.
  delete process.env['ELECTRON_RENDERER_URL']

  vi.resetModules()
  await import('./index')
  // app.whenReady().then(...) runs as a microtask: let it register handlers.
  await Promise.resolve()
  await new Promise(r => setTimeout(r, 0))

  getDatabase = (await import('./database')).getDatabase
})

afterAll(() => {
  vi.unstubAllGlobals()
  try { rmSync(tmpRoot, { recursive: true, force: true }) } catch {}
})

beforeEach(() => {
  h.sent.length = 0
  const db = getDatabase()
  db.exec('DELETE FROM auth; DELETE FROM downloads; DELETE FROM downloaded_lyrics; DELETE FROM audio_cache; DELETE FROM settings; DELETE FROM lyrics_cache;')
})

describe('main process: IPC registration', () => {
  it('registers every channel the preload bridge expects', () => {
    const expected = [
      'db:get-auth', 'db:save-auth', 'db:clear-auth',
      'download:start', 'download:remove', 'download:list', 'download:get', 'download:get-path',
      'collage:save',
      'cache:audio:save', 'cache:audio:get', 'cache:clear',
      'settings:get', 'settings:set',
      'lyrics:get', 'lyrics:save', 'lyrics:get-downloaded', 'lyrics:save-downloaded',
      'file:get-url'
    ]
    for (const ch of expected) expect(h.handlers.has(ch)).toBe(true)
  })
})

describe('main process: auth persistence', () => {
  const auth = { serverUrl: 'http://s', token: 't', userId: 'u', username: 'me', serverId: 'sid' }

  it('saves, reads back, and clears the single auth row', () => {
    expect(invoke('db:get-auth')).toBeNull()
    invoke('db:save-auth', auth)
    const row = invoke('db:get-auth') as Record<string, unknown>
    expect(row).toMatchObject({ server_url: 'http://s', token: 't', user_id: 'u', username: 'me', server_id: 'sid' })
    invoke('db:clear-auth')
    expect(invoke('db:get-auth')).toBeNull()
  })

  it('keeps only the latest auth row (save deletes prior rows)', () => {
    invoke('db:save-auth', auth)
    invoke('db:save-auth', { ...auth, username: 'other' })
    const count = getDatabase().prepare('SELECT COUNT(*) c FROM auth').get() as { c: number }
    expect(count.c).toBe(1)
    expect((invoke('db:get-auth') as any).username).toBe('other')
  })
})

describe('main process: settings & lyrics', () => {
  it('round-trips settings and returns null for unknown keys', () => {
    expect(invoke('settings:get', 'theme')).toBeNull()
    invoke('settings:set', 'theme', 'dark')
    expect(invoke('settings:get', 'theme')).toBe('dark')
    invoke('settings:set', 'theme', 'light')
    expect(invoke('settings:get', 'theme')).toBe('light')
  })

  it('round-trips session and downloaded lyrics independently', () => {
    invoke('lyrics:save', 'song1', '[00:01.00]hi')
    invoke('lyrics:save-downloaded', 'song1', '[00:02.00]offline')
    expect(invoke('lyrics:get', 'song1')).toBe('[00:01.00]hi')
    expect(invoke('lyrics:get-downloaded', 'song1')).toBe('[00:02.00]offline')
    expect(invoke('lyrics:get', 'missing')).toBeNull()
  })
})

describe('main process: downloads', () => {
  it('streams a download to disk, records it, and emits a complete event', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      const r = new Response(Buffer.from('AUDIO-DATA'))
      return r
    }))
    const res = await invoke('download:start', { itemId: 'd1', url: 'http://x/a', filename: 'A.mp3', metadata: '{}' })
    expect(res).toEqual({ success: true })
    await flushDisk()

    const row = invoke('download:get', 'd1') as any
    expect(row.status).toBe('completed')
    expect(existsSync(row.file_path)).toBe(true)
    expect(invoke('download:get-path', 'd1')).toBe(row.file_path)
    expect(invoke('download:list')).toHaveLength(1)
    expect(h.sent.some(s => s.channel === 'download:complete')).toBe(true)
  })

  it('marks a download failed and emits an error event on a bad response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => byteResponse(new Uint8Array(), 500)))
    const res = await invoke('download:start', { itemId: 'd2', url: 'http://x/b', filename: 'B.mp3', metadata: '{}' })
    expect(res.success).toBe(false)
    const row = invoke('download:get', 'd2') as any
    expect(row.status).toBe('failed')
    expect(invoke('download:get-path', 'd2')).toBeNull()
    expect(h.sent.some(s => s.channel === 'download:error')).toBe(true)
  })

  it('removes a downloaded file, its row, and any downloaded lyrics', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.from('x'))))
    await invoke('download:start', { itemId: 'd3', url: 'http://x/c', filename: 'C.mp3', metadata: '{}' })
    invoke('lyrics:save-downloaded', 'd3', 'lrc')
    await flushDisk()
    const path = invoke('download:get-path', 'd3') as string
    expect(existsSync(path)).toBe(true)

    invoke('download:remove', 'd3')
    expect(existsSync(path)).toBe(false)
    expect(invoke('download:get', 'd3')).toBeNull()
    expect(invoke('lyrics:get-downloaded', 'd3')).toBeNull()
  })
})

describe('main process: audio cache', () => {
  it('caches audio to disk and records it (pipeline import regression)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.from('CACHED-AUDIO'))))
    const filePath = await invoke('cache:audio:save', { itemId: 'c1', url: 'http://x/s', quality: 'hi' }) as string
    expect(filePath).toBeTruthy()
    expect(existsSync(filePath)).toBe(true)
    expect(readFileSync(filePath, 'utf8')).toBe('CACHED-AUDIO')

    const row = getDatabase().prepare('SELECT * FROM audio_cache WHERE item_id = ?').get('c1') as any
    expect(row.file_path).toBe(filePath)
    expect(row.file_size).toBe(Buffer.from('CACHED-AUDIO').length)
  })

  it('returns null when the upstream fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => byteResponse(new Uint8Array(), 404)))
    expect(await invoke('cache:audio:save', { itemId: 'c2', url: 'http://x/y', quality: 'hi' })).toBeNull()
    expect(getDatabase().prepare('SELECT * FROM audio_cache WHERE item_id = ?').get('c2')).toBeUndefined()
  })

  it('cache:audio:get returns the path for an existing file and null otherwise', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.from('z'))))
    const filePath = await invoke('cache:audio:save', { itemId: 'c3', url: 'http://x/z', quality: 'lo' }) as string
    expect(invoke('cache:audio:get', 'c3')).toBe(filePath)
    expect(invoke('cache:audio:get', 'nope')).toBeNull()
  })

  it('cache:clear deletes files and rows', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.from('z'))))
    const filePath = await invoke('cache:audio:save', { itemId: 'c4', url: 'http://x/z', quality: 'lo' }) as string
    invoke('cache:clear')
    expect(existsSync(filePath)).toBe(false)
    expect(getDatabase().prepare('SELECT COUNT(*) c FROM audio_cache').get()).toEqual({ c: 0 })
  })
})

describe('main process: collage export', () => {
  it('sanitizes the filename, forces a .png extension, and writes to the downloads dir', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    const res = await invoke('collage:save', { bytes, filename: 'my collage!!' }) as any
    expect(res.success).toBe(true)
    expect(res.path).toBe(join(h.paths.downloads, 'my_collage__.png'))
    expect(existsSync(res.path)).toBe(true)
    expect(Array.from(readFileSync(res.path))).toEqual([1, 2, 3])
  })

  it('rejects path traversal attempts', async () => {
    const res = await invoke('collage:save', { bytes: new Uint8Array([0]), filename: '../escape' }) as any
    // '../escape' is sanitized to '.._escape.png', which stays inside downloads.
    expect(res.success).toBe(true)
    expect(res.path).toBe(join(h.paths.downloads, '.._escape.png'))
  })
})

describe('main process: file:get-url', () => {
  it('returns a file:// url for existing files and null for missing ones', () => {
    const f = join(tmpRoot, 'present.bin')
    writeFileSync(f, 'data')
    expect(invoke('file:get-url', f)).toBe(`file://${f}`)
    expect(invoke('file:get-url', join(tmpRoot, 'absent.bin'))).toBeNull()
  })
})

describe('main process: download progress', () => {
  it('emits download:progress events when the response has a content-length', async () => {
    const payload = Buffer.from('PROGRESS-DATA')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(payload, {
      headers: { 'content-length': String(payload.length) }
    })))
    await invoke('download:start', { itemId: 'dp1', url: 'http://x/p', filename: 'P.mp3', metadata: '{}' })
    await flushDisk()
    const progress = h.sent.filter(s => s.channel === 'download:progress')
    expect(progress.length).toBeGreaterThan(0)
    expect((progress.at(-1)!.data as any).progress).toBe(1)
  })
})

describe('main process: cache eviction (2GB LRU)', () => {
  it('evicts the least-recently-used entries when the cache exceeds the limit', async () => {
    const db = getDatabase()
    const bigFile = join(tmpRoot, 'evict-me.audio')
    writeFileSync(bigFile, 'big')
    const oneSixGB = 1_600_000_000
    // Oldest entry backed by a real file (covers the unlink branch).
    db.prepare(`INSERT INTO audio_cache (item_id, quality, file_path, file_size, last_accessed) VALUES (?, ?, ?, ?, datetime('now', '-2 hours'))`)
      .run('evOld', 'q', bigFile, oneSixGB)
    // Newer entry whose file no longer exists (covers the existsSync-false branch).
    db.prepare(`INSERT INTO audio_cache (item_id, quality, file_path, file_size, last_accessed) VALUES (?, ?, ?, ?, datetime('now', '-1 hours'))`)
      .run('evNew', 'q', join(tmpRoot, 'gone.audio'), oneSixGB)

    // Saving a new small entry pushes the total past 2GB and triggers eviction.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.from('tiny'))))
    await invoke('cache:audio:save', { itemId: 'evFresh', url: 'http://x/f', quality: 'q' })

    expect(db.prepare('SELECT 1 FROM audio_cache WHERE item_id = ?').get('evOld')).toBeUndefined()
    expect(existsSync(bigFile)).toBe(false)
    // The newer entry and the fresh entry survive.
    expect(db.prepare('SELECT 1 FROM audio_cache WHERE item_id = ?').get('evNew')).toBeTruthy()
    expect(db.prepare('SELECT 1 FROM audio_cache WHERE item_id = ?').get('evFresh')).toBeTruthy()
  })
})

describe('main process: collage export errors', () => {
  it('returns a failure result when writing the file throws', async () => {
    // Passing non-buffer bytes makes Buffer.from() throw inside the handler.
    const res = await invoke('collage:save', { bytes: undefined as unknown as Uint8Array, filename: 'x' }) as any
    expect(res.success).toBe(false)
    expect(res.error).toBeTruthy()
  })

  it('defaults the base name to "collage" when no filename is given', async () => {
    const res = await invoke('collage:save', { bytes: new Uint8Array([7]), filename: '' }) as any
    expect(res.success).toBe(true)
    expect(res.path).toBe(join(h.paths.downloads, 'collage.png'))
  })
})

describe('main process: window & lifecycle wiring', () => {
  it('opens external URLs through the shell and denies in-app navigation', async () => {
    const { shell } = await import('electron') as any
    expect(h.windowOpenHandler).toBeTypeOf('function')
    const result = h.windowOpenHandler!({ url: 'https://example.com' })
    expect(shell.openExternal).toHaveBeenCalledWith('https://example.com')
    expect(result).toEqual({ action: 'deny' })
  })

  it('serves local-audio:// requests via net.fetch against a file:// URL', () => {
    expect(h.protocolHandler).toBeTypeOf('function')
    h.protocolHandler!({ url: 'local-audio://%2Ftmp%2Fsong.audio' })
    expect(h.netFetch).toHaveBeenCalledWith('file:///tmp/song.audio')
  })

  it('re-creates the window on activate, honoring the renderer dev URL branch', () => {
    const activate = h.appHandlers.get('activate')
    expect(activate).toBeTypeOf('function')
    // With the dev URL set, createWindow() should take the loadURL() branch.
    process.env['ELECTRON_RENDERER_URL'] = 'http://localhost:5173'
    expect(() => activate!()).not.toThrow()
    delete process.env['ELECTRON_RENDERER_URL']
  })

  it('quits on window-all-closed on non-darwin platforms', async () => {
    const { app } = await import('electron') as any
    const handler = h.appHandlers.get('window-all-closed')
    expect(handler).toBeTypeOf('function')
    handler!()
    if (process.platform !== 'darwin') {
      expect(app.quit).toHaveBeenCalled()
    }
  })
})
