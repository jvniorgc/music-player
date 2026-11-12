import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { pathToFileURL } from 'url'

// Shared state captured by the electron mock (hoisted so the vi.mock factory can see it).
const h = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  appHandlers: new Map<string, (...args: any[]) => any>(),
  sent: [] as { channel: string; data: unknown }[],
  paths: { userData: '', downloads: '' },
  windowOpenHandler: null as null | ((d: { url: string }) => unknown),
  protocolHandler: null as null | ((req: { url: string }) => unknown),
  netFetch: null as null | ReturnType<typeof vi.fn>,
  windowOpts: null as Record<string, any> | null,
  navigateHandler: null as null | ((e: { preventDefault: () => void }, url: string) => void),
  headersHandler: null as null | ((details: any, cb: (r: any) => void) => void),
  privileged: [] as unknown[],
  encAvailable: false,
  win: null as any,
  minimized: false
}))

vi.mock('electron', () => {
  class BrowserWindow {
    constructor(opts?: Record<string, any>) { h.windowOpts = opts ?? null; h.win = this }
    isMinimized = () => h.minimized
    restore = vi.fn()
    show = vi.fn()
    focus = vi.fn()
    webContents = {
      setWindowOpenHandler: (cb: (d: { url: string }) => unknown) => { h.windowOpenHandler = cb },
      on: (event: string, cb: any) => { if (event === 'will-navigate') h.navigateHandler = cb },
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
      quit: vi.fn(),
      getVersion: () => '9.9.9'
    },
    BrowserWindow,
    ipcMain: { handle: (channel: string, cb: (...a: any[]) => any) => h.handlers.set(channel, cb) },
    shell: { openExternal: vi.fn().mockResolvedValue(undefined) },
    protocol: { registerSchemesAsPrivileged: (s: unknown[]) => { h.privileged.push(...s) } },
    session: {
      defaultSession: {
        protocol: { handle: (_scheme: string, cb: (req: { url: string }) => unknown) => { h.protocolHandler = cb } },
        webRequest: { onHeadersReceived: (_f: unknown, cb: any) => { h.headersHandler = cb } }
      }
    },
    net: { fetch: netFetch },
    Menu: { setApplicationMenu: vi.fn() },
    safeStorage: {
      isEncryptionAvailable: () => h.encAvailable,
      encryptString: (v: string) => Buffer.from('X' + v, 'utf8'),
      decryptString: (b: Buffer) => {
        const v = b.toString('utf8')
        if (!v.startsWith('X')) throw new Error('undecryptable')
        return v.slice(1)
      }
    }
  }
})

vi.mock('./globalShortcuts', () => ({
  applyGlobalShortcuts: vi.fn((_b: unknown, send: (a: string) => void) => { send('next'); return { failed: [] } }),
  clearGlobalShortcuts: vi.fn(),
}))
vi.mock('./updater', () => ({ initAutoUpdater: vi.fn() }))
vi.mock('./discord', () => ({
  isEnabled: vi.fn(() => true),
  setEnabled: vi.fn(),
  setActivity: vi.fn().mockResolvedValue(undefined),
  shutdown: vi.fn().mockResolvedValue(undefined),
}))

let tmpRoot = ''
let getDatabase: typeof import('./database')['getDatabase']

// Invoke a captured IPC handler with the conventional (event, ...args) shape.
function invoke(channel: string, ...args: unknown[]) {
  const cb = h.handlers.get(channel)
  if (!cb) throw new Error(`No handler registered for ${channel}`)
  return cb({}, ...args)
}

// Read through a function so TS doesn't narrow after `h.windowOpts = null`.
const windowOpts = () => h.windowOpts

function byteResponse(bytes: Uint8Array, status = 200) {
  return new Response(status >= 200 && status < 300 ? new Uint8Array(bytes) : null, { status })
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
  h.encAvailable = false
  const db = getDatabase()
  db.exec('DELETE FROM auth; DELETE FROM downloads; DELETE FROM downloaded_lyrics; DELETE FROM audio_cache; DELETE FROM settings; DELETE FROM lyrics_cache;')
})

describe('main process: IPC registration', () => {
  it('registers every channel the preload bridge expects', () => {
    const expected = [
      'db:get-auth', 'db:save-auth', 'db:clear-auth',
      'download:start', 'download:remove', 'download:list', 'download:get', 'download:get-path',
      'collage:save',
      'cache:audio:save', 'cache:audio:get', 'cache:clear', 'app:get-version',
      'settings:get', 'settings:set',
      'lastfm:get-status', 'lastfm:set-credentials', 'lastfm:set-enabled', 'lastfm:start-auth',
      'lastfm:finish-auth', 'lastfm:disconnect', 'lastfm:now-playing', 'lastfm:scrobble',
      'lastfm:get-similar-tracks', 'lastfm:get-info',
      'lyrics:get', 'lyrics:save', 'lyrics:get-downloaded', 'lyrics:save-downloaded',
      'file:get-url', 'cors:allow-origin'
    ]
    for (const ch of expected) expect(h.handlers.has(ch)).toBe(true)
  })

  it('app:get-version returns the app version', async () => {
    expect(await h.handlers.get('app:get-version')!()).toBe('9.9.9')
  })
})

describe('main process: Last.fm similar tracks handler', () => {
  it('forwards the seed and limit to the Last.fm client', async () => {
    // With no API key stored, getSimilarTracks short-circuits to [] without any fetch.
    const out = await invoke('lastfm:get-similar-tracks', { artist: 'Radiohead', track: 'Reckoner' }, 5)
    expect(out).toEqual([])
  })

  it('returns normalized recommendations once the API key is configured', async () => {
    getDatabase().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('lastfm_api_key', 'k')
    h.netFetch!.mockResolvedValueOnce(new Response(JSON.stringify({
      similartracks: { track: [{ name: 'Nude', match: '0.9', artist: { name: 'Radiohead' } }] },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    const out = await invoke('lastfm:get-similar-tracks', { artist: 'Radiohead', track: 'Reckoner' })
    expect(out).toEqual([{ artist: 'Radiohead', track: 'Nude', match: 0.9 }])
  })
})

describe('main process: Discord handlers', () => {
  it('forwards to the discord module and shuts it down on quit', async () => {
    const discord = await import('./discord')
    expect(invoke('discord:get-enabled')).toBe(true)
    invoke('discord:set-enabled', true)
    expect(discord.setEnabled).toHaveBeenCalledWith(true)
    invoke('discord:set-enabled', 'yes')
    expect(discord.setEnabled).toHaveBeenLastCalledWith(false)
    const p = { title: 't', artist: 'a', position: 0, duration: 1 }
    await invoke('discord:set-activity', p)
    expect(discord.setActivity).toHaveBeenCalledWith(p)
    h.appHandlers.get('before-quit')!()
    expect(discord.shutdown).toHaveBeenCalled()
  })
})

describe('main process: global shortcuts & window focus', () => {
  it('applies bindings, forwards presses and clears on quit', async () => {
    const gs = await import('./globalShortcuts')
    expect(await invoke('shortcuts:set-global', { next: 'F9' })).toEqual({ failed: [] })
    expect(gs.applyGlobalShortcuts).toHaveBeenCalledWith({ next: 'F9' }, expect.any(Function))
    expect(h.sent).toContainEqual({ channel: 'shortcuts:global', data: 'next' })
    h.appHandlers.get('will-quit')!()
    expect(gs.clearGlobalShortcuts).toHaveBeenCalled()
  })

  it('focuses (and restores) the main window', () => {
    invoke('window:focus')
    expect(h.win.restore).not.toHaveBeenCalled()
    h.minimized = true
    invoke('window:focus')
    expect(h.win.restore).toHaveBeenCalled()
    expect(h.win.show).toHaveBeenCalled()
    expect(h.win.focus).toHaveBeenCalled()
  })
})

describe('main process: Last.fm info handler', () => {
  it('forwards method and params to the Last.fm client', async () => {
    expect(await invoke('lastfm:get-info', 'artist.getInfo', { artist: 'A' })).toBeNull()
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

  it('upgrades a legacy plaintext token to encrypted storage on read', () => {
    invoke('db:save-auth', auth)
    h.encAvailable = true
    expect((invoke('db:get-auth') as any).token).toBe('t')
    const stored = getDatabase().prepare('SELECT token FROM auth').get() as { token: string }
    expect(stored.token.startsWith('enc:v1:')).toBe(true)
    expect((invoke('db:get-auth') as any).token).toBe('t')
  })

  it('drops an undecryptable token so the user logs in again', () => {
    invoke('db:save-auth', auth)
    getDatabase().prepare('UPDATE auth SET token = ?').run('enc:v1:' + Buffer.from('garbage').toString('base64'))
    h.encAvailable = true
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(invoke('db:get-auth')).toBeNull()
    expect((getDatabase().prepare('SELECT COUNT(*) c FROM auth').get() as { c: number }).c).toBe(0)
    warn.mockRestore()
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

  it('still removes the row when deleting the file fails', () => {
    const dir = join(h.paths.userData, 'downloads', 'not-a-file')
    mkdirSync(dir, { recursive: true })
    getDatabase().prepare('INSERT INTO downloads (item_id, file_path, filename, status) VALUES (?, ?, ?, ?)').run('d4', dir, 'x', 'completed')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    invoke('download:remove', 'd4')
    expect(warn).toHaveBeenCalledWith('[main] failed to delete', dir, expect.anything())
    expect(invoke('download:get', 'd4')).toBeNull()
    warn.mockRestore()
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
  it('returns a local-audio url for existing app files and null for missing ones', () => {
    const f = join(h.paths.userData, 'downloads', 'present.audio')
    writeFileSync(f, 'data')
    expect(invoke('file:get-url', f)).toBe(`local-audio://${encodeURIComponent(f)}`)
    expect(invoke('file:get-url', join(h.paths.userData, 'downloads', 'absent.audio'))).toBeNull()
  })

  it('rejects paths outside the app dirs, traversal and non-strings', () => {
    const outside = join(tmpRoot, 'present.bin')
    writeFileSync(outside, 'data')
    expect(invoke('file:get-url', outside)).toBeNull()
    expect(invoke('file:get-url', join(h.paths.userData, 'downloads', '..', '..', 'present.bin'))).toBeNull()
    expect(invoke('file:get-url', 42)).toBeNull()
  })
})

describe('main process: input validation', () => {
  it('rejects downloads with non-http URLs or unsafe item ids', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await invoke('download:start', { itemId: 'ok', url: 'file:///etc/passwd', filename: 'x', metadata: '{}' }))
      .toMatchObject({ success: false })
    expect(await invoke('download:start', { itemId: '../../evil', url: 'http://x/a', filename: 'x', metadata: '{}' }))
      .toMatchObject({ success: false })
    expect(await invoke('cache:audio:save', { itemId: 'c', url: 'javascript:alert(1)', quality: 'hi' })).toBeNull()
    expect(await invoke('cache:audio:save', { itemId: 'c', url: 'http://x', quality: '../q' })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not delete files outside the downloads dir on download:remove', () => {
    const victim = join(tmpRoot, 'victim.txt')
    writeFileSync(victim, 'keep')
    getDatabase().prepare(`INSERT INTO downloads (item_id, file_path, filename, status) VALUES ('v', ?, 'v', 'completed')`).run(victim)
    invoke('download:remove', 'v')
    expect(existsSync(victim)).toBe(true)
  })

  it('never exposes Last.fm secrets through the generic settings channel', () => {
    getDatabase().prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('lastfm_session_key', 'sk')
    expect(invoke('settings:get', 'lastfm_session_key')).toBeNull()
    expect(() => invoke('settings:set', 'lastfm_session_key', 'x')).toThrow()
  })

  it('rejects malformed auth data', () => {
    expect(() => invoke('db:save-auth', { serverUrl: 'javascript:x', token: 't', userId: 'u', username: 'n', serverId: 's' })).toThrow()
  })
})

describe('main process: CORS allowlist', () => {
  const run = (details: Record<string, unknown>) => {
    let result: any
    h.headersHandler!({ method: 'GET', statusCode: 200, responseHeaders: {}, ...details }, r => { result = r })
    return result
  }

  it('adds CORS headers only for the configured Jellyfin/slskd origins and public APIs', async () => {
    invoke('db:save-auth', { serverUrl: 'http://jf.lan:8096', token: 't', userId: 'u', username: 'n', serverId: 's' })
    await invoke('cors:allow-origin', 'http://jf.lan:5030')
    expect(run({ url: 'http://jf.lan:8096/Items' }).responseHeaders['Access-Control-Allow-Origin']).toEqual(['*'])
    expect(run({ url: 'http://jf.lan:5030/api/v0/session' }).responseHeaders).toBeTruthy()
    expect(run({ url: 'https://ia800.us.archive.org/x.jpg' }).responseHeaders).toBeTruthy()
    expect(run({ url: 'http://evil.example/' })).toEqual({})
  })

  it('leaves existing CORS headers alone and answers failed preflights', () => {
    invoke('db:save-auth', { serverUrl: 'http://jf.lan:8096', token: 't', userId: 'u', username: 'n', serverId: 's' })
    expect(run({ url: 'http://jf.lan:8096/x', responseHeaders: { 'access-control-allow-origin': ['*'] } })).toEqual({})
    expect(run({ url: 'http://jf.lan:8096/x', method: 'OPTIONS', statusCode: 405 }).statusLine).toMatch(/204/)
  })

  it('rejects non-http origins', async () => {
    await expect(async () => invoke('cors:allow-origin', 'file:///')).rejects.toThrow()
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
    const bigFile = join(h.paths.userData, 'cache', 'audio', 'evict-me.audio')
    writeFileSync(bigFile, 'big')
    const oneSixGB = 1_600_000_000
    // Oldest entry backed by a real file (covers the unlink branch).
    db.prepare(`INSERT INTO audio_cache (item_id, quality, file_path, file_size, last_accessed) VALUES (?, ?, ?, ?, datetime('now', '-2 hours'))`)
      .run('evOld', 'q', bigFile, oneSixGB)
    // Newer entry whose file no longer exists (covers the existsSync-false branch).
    db.prepare(`INSERT INTO audio_cache (item_id, quality, file_path, file_size, last_accessed) VALUES (?, ?, ?, ?, datetime('now', '-1 hours'))`)
      .run('evNew', 'q', join(h.paths.userData, 'cache', 'audio', 'gone.audio'), oneSixGB)

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
  it('runs the renderer sandboxed with web security on', () => {
    expect(h.windowOpts?.webPreferences).toMatchObject({ sandbox: true, webSecurity: true, contextIsolation: true, nodeIntegration: false })
  })

  it('opens only http(s)/mailto URLs externally and always denies new windows', async () => {
    const { shell } = await import('electron') as any
    shell.openExternal.mockClear()
    expect(h.windowOpenHandler).toBeTypeOf('function')
    expect(h.windowOpenHandler!({ url: 'https://example.com' })).toEqual({ action: 'deny' })
    expect(shell.openExternal).toHaveBeenCalledWith('https://example.com')
    for (const url of ['file:///etc/passwd', 'smb://host/share', 'javascript:alert(1)']) {
      expect(h.windowOpenHandler!({ url })).toEqual({ action: 'deny' })
    }
    expect(shell.openExternal).toHaveBeenCalledTimes(1)
  })

  it('blocks in-window navigation away from the app', () => {
    const preventDefault = vi.fn()
    h.navigateHandler!({ preventDefault }, 'https://evil.example/')
    expect(preventDefault).toHaveBeenCalled()
    preventDefault.mockClear()
    h.navigateHandler!({ preventDefault }, '::not a url::')
    expect(preventDefault).toHaveBeenCalled()
  })

  it('allows navigation within the dev server origin only', () => {
    process.env['ELECTRON_RENDERER_URL'] = 'http://localhost:5173'
    try {
      const preventDefault = vi.fn()
      h.navigateHandler!({ preventDefault }, 'http://localhost:5173/#/settings')
      expect(preventDefault).not.toHaveBeenCalled()
      h.navigateHandler!({ preventDefault }, 'http://localhost:9999/')
      expect(preventDefault).toHaveBeenCalled()
    } finally {
      delete process.env['ELECTRON_RENDERER_URL']
    }
  })

  it('serves local-audio:// only for files inside the app dirs', async () => {
    expect(h.protocolHandler).toBeTypeOf('function')
    const inside = join(h.paths.userData, 'cache', 'audio', 'song.audio')
    const ok = await h.protocolHandler!({ url: `local-audio://${encodeURIComponent(inside)}` }) as Response
    expect(h.netFetch).toHaveBeenCalledWith(pathToFileURL(inside).toString(), expect.anything())
    // CORS header lets crossOrigin="anonymous" elements feed the Web Audio equalizer.
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(ok.status).toBe(200)
    const denied = await h.protocolHandler!({ url: 'local-audio://%2Fetc%2Fpasswd' }) as Response
    expect(denied.status).toBe(403)
    const bad = await h.protocolHandler!({ url: 'local-audio://%E0%A4%A' }) as Response
    expect(bad.status).toBe(400)
    expect(h.privileged).toContainEqual(expect.objectContaining({ scheme: 'local-audio', privileges: expect.objectContaining({ corsEnabled: true }) }))
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

  it('uses the macOS hidden-inset titlebar when running on darwin', () => {
    const activate = h.appHandlers.get('activate')
    expect(activate).toBeTypeOf('function')
    const original = process.platform

    // darwin: integrated hidden-inset titlebar with repositioned traffic lights.
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    try {
      h.windowOpts = null
      activate!()
      expect(windowOpts()?.titleBarStyle).toBe('hiddenInset')
      expect(windowOpts()?.trafficLightPosition).toEqual({ x: 16, y: 20 })

      // non-darwin: keep the OS default frame (no titlebar overrides).
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
      h.windowOpts = null
      activate!()
      expect(windowOpts()?.titleBarStyle).toBeUndefined()
      expect(windowOpts()?.trafficLightPosition).toBeUndefined()
    } finally {
      Object.defineProperty(process, 'platform', { value: original, configurable: true })
    }
  })
})
