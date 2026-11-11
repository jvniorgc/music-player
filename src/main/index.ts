import { app, BrowserWindow, ipcMain, shell, session, net, Menu, protocol } from 'electron'
import { join, resolve, sep } from 'path'
import { pathToFileURL } from 'url'
import { initDatabase, getDatabase } from './database'
import { existsSync, mkdirSync, createWriteStream, unlinkSync, statSync, readdirSync } from 'fs'
import { writeFile } from 'fs/promises'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { initAutoUpdater } from './updater'
import * as lastfm from './lastfm'
import type { LastfmTrack } from '@music-player/core/platform'
import { encryptSecret, decryptSecret, needsMigration } from './secrets'
import { isHttpUrl, isSafeExternalUrl, isSafeId, resolveInside, originOf, isCorsAllowed, toLocalAudioUrl } from './security'

let mainWindow: BrowserWindow | null = null

// local-audio:// serves cached/downloaded files. It must be privileged (stream
// for range requests/seeking) so it works with webSecurity enabled, instead of
// exposing raw file:// URLs to the renderer.
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-audio', privileges: { stream: true, supportFetchAPI: true } }
])

/** Origins of user-configured servers (Jellyfin, slskd) the renderer may call cross-origin. */
const corsOrigins = new Set<string>()

// Allow audio autoplay without user gesture (async source resolution breaks gesture chain)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

let DOWNLOADS_DIR = ''
let CACHE_DIR = ''
let CACHE_ART_DIR = ''
let CACHE_AUDIO_DIR = ''

function initPaths() {
  DOWNLOADS_DIR = join(app.getPath('userData'), 'downloads')
  CACHE_DIR = join(app.getPath('userData'), 'cache')
  CACHE_ART_DIR = join(CACHE_DIR, 'artwork')
  CACHE_AUDIO_DIR = join(CACHE_DIR, 'audio')
}

function ensureDirs() {
  for (const dir of [DOWNLOADS_DIR, CACHE_DIR, CACHE_ART_DIR, CACHE_AUDIO_DIR]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }
}

function clearSessionCaches() {
  const db = getDatabase()

  // Clear audio cache files
  if (existsSync(CACHE_AUDIO_DIR)) {
    for (const file of readdirSync(CACHE_AUDIO_DIR)) {
      try { unlinkSync(join(CACHE_AUDIO_DIR, file)) } catch {}
    }
  }
  db.prepare('DELETE FROM audio_cache').run()

  // Clear session lyrics cache (downloaded_lyrics persists)
  db.prepare('DELETE FROM lyrics_cache').run()
}

function createWindow() {
  Menu.setApplicationMenu(null)

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#000000',
    // macOS: titlebar oculto com os botões da janela sobrepostos (integrados ao app).
    // Windows/Linux mantêm o frame padrão do SO.
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 20 } }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url).catch(err => console.warn('[main] openExternal failed', err))
    } else {
      console.warn('[main] blocked window.open for', url)
    }
    return { action: 'deny' }
  })

  // Never navigate the app window away from the bundled renderer.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault()
      if (isSafeExternalUrl(url)) shell.openExternal(url).catch(err => console.warn('[main] openExternal failed', err))
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function isAppUrl(url: string): boolean {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    const devOrigin = originOf(devUrl)
    return !!devOrigin && originOf(url) === devOrigin
  }
  try {
    const target = new URL(url)
    const appIndex = pathToFileURL(join(__dirname, '../renderer/index.html'))
    return target.protocol === 'file:' && target.pathname === appIndex.pathname
  } catch {
    return false
  }
}

/**
 * webSecurity used to be disabled because the renderer calls servers that do
 * not send CORS headers (slskd, Cover Art Archive redirects to archive.org) and
 * because cached audio was loaded via file://. Instead of disabling the same-
 * origin policy globally, add CORS headers only for the configured Jellyfin /
 * slskd origins and the fixed public metadata APIs.
 */
function setupCors() {
  session.defaultSession.webRequest.onHeadersReceived({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    if (!isCorsAllowed(details.url, corsOrigins)) {
      callback({})
      return
    }
    const headers = { ...(details.responseHeaders ?? {}) }
    const has = (name: string) => Object.keys(headers).some(k => k.toLowerCase() === name)
    if (has('access-control-allow-origin')) {
      callback({})
      return
    }
    headers['Access-Control-Allow-Origin'] = ['*']
    headers['Access-Control-Allow-Headers'] = ['Authorization, Content-Type, X-Emby-Authorization, X-API-Key']
    headers['Access-Control-Allow-Methods'] = ['GET, HEAD, POST, PUT, DELETE, OPTIONS']
    const preflightFailed = details.method === 'OPTIONS' && (details.statusCode < 200 || details.statusCode >= 300)
    callback(preflightFailed
      ? { responseHeaders: headers, statusLine: 'HTTP/1.1 204 No Content' }
      : { responseHeaders: headers })
  })
}

function allowCorsOrigin(url: unknown) {
  const origin = originOf(url)
  if (origin) corsOrigins.add(origin)
}

type AuthRow = { server_url: string; token: string; user_id: string; username: string; server_id: string }

function readAuth(): AuthRow | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM auth LIMIT 1').get() as AuthRow | undefined
  if (!row) return null
  const token = decryptSecret(row.token)
  if (token === null) {
    // Undecryptable (keychain changed): force a fresh login.
    db.prepare('DELETE FROM auth').run()
    return null
  }
  if (needsMigration(row.token)) {
    db.prepare('UPDATE auth SET token = ?').run(encryptSecret(token))
  }
  allowCorsOrigin(row.server_url)
  return { ...row, token }
}

function setupIPC() {
  const db = getDatabase()

  // --- Auth persistence ---
  ipcMain.handle('db:get-auth', () => readAuth())

  ipcMain.handle('db:save-auth', (_e, data: { serverUrl: string; token: string; userId: string; username: string; serverId: string }) => {
    const fields = [data?.serverUrl, data?.token, data?.userId, data?.username, data?.serverId]
    if (!fields.every(f => typeof f === 'string') || !isHttpUrl(data.serverUrl)) {
      throw new Error('Invalid auth data')
    }
    db.transaction(() => {
      db.prepare('DELETE FROM auth').run()
      db.prepare('INSERT INTO auth (server_url, token, user_id, username, server_id) VALUES (?, ?, ?, ?, ?)').run(
        data.serverUrl, encryptSecret(data.token), data.userId, data.username, data.serverId
      )
    })()
    allowCorsOrigin(data.serverUrl)
  })

  // Lets the renderer register a user-configured server (e.g. slskd) for CORS.
  ipcMain.handle('cors:allow-origin', (_e, url: unknown) => {
    if (!isHttpUrl(url)) throw new Error('Invalid URL')
    allowCorsOrigin(url)
  })

  ipcMain.handle('db:clear-auth', () => {
    db.prepare('DELETE FROM auth').run()
  })

  // --- Downloads ---
  ipcMain.handle('download:start', async (_e, data: { itemId: string; url: string; filename: string; metadata: string }) => {
    if (!isSafeId(data?.itemId) || !isHttpUrl(data?.url)) {
      return { success: false, error: 'Invalid download request' }
    }
    const filePath = join(DOWNLOADS_DIR, `${data.itemId}.audio`)
    try {
      db.prepare(`INSERT OR REPLACE INTO downloads (item_id, file_path, filename, metadata, status) VALUES (?, ?, ?, ?, 'downloading')`).run(
        data.itemId, filePath, String(data.filename ?? ''), typeof data.metadata === 'string' ? data.metadata : null
      )

      const resp = await fetch(data.url)
      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`)

      const totalBytes = Number(resp.headers.get('content-length') || 0)
      const writer = createWriteStream(filePath)
      const reader = resp.body.getReader()
      let downloadedBytes = 0

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        writer.write(Buffer.from(value))
        downloadedBytes += value.byteLength
        if (totalBytes > 0) {
          mainWindow?.webContents.send('download:progress', {
            itemId: data.itemId,
            progress: downloadedBytes / totalBytes
          })
        }
      }
      await new Promise<void>((res, rej) => writer.end((err?: Error | null) => (err ? rej(err) : res())))

      db.prepare(`UPDATE downloads SET status = 'completed', file_size = ? WHERE item_id = ?`).run(downloadedBytes, data.itemId)
      mainWindow?.webContents.send('download:complete', { itemId: data.itemId })
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn('[main] download failed', data.itemId, message)
      db.prepare(`UPDATE downloads SET status = 'failed' WHERE item_id = ?`).run(data.itemId)
      mainWindow?.webContents.send('download:error', { itemId: data.itemId, error: message })
      return { success: false, error: message }
    }
  })

  ipcMain.handle('download:remove', (_e, itemId: string) => {
    if (typeof itemId !== 'string') return
    const row = db.prepare('SELECT file_path FROM downloads WHERE item_id = ?').get(itemId) as { file_path: string } | undefined
    safeUnlink(row?.file_path, [DOWNLOADS_DIR])
    db.prepare('DELETE FROM downloads WHERE item_id = ?').run(itemId)
    db.prepare('DELETE FROM downloaded_lyrics WHERE item_id = ?').run(itemId)
  })

  ipcMain.handle('download:list', () => {
    return db.prepare('SELECT * FROM downloads WHERE status = ?').all('completed')
  })

  ipcMain.handle('download:get', (_e, itemId: string) => {
    return db.prepare('SELECT * FROM downloads WHERE item_id = ?').get(itemId) || null
  })

  ipcMain.handle('download:get-path', (_e, itemId: string) => {
    const row = db.prepare('SELECT file_path FROM downloads WHERE item_id = ? AND status = ?').get(itemId, 'completed') as { file_path: string } | undefined
    return row?.file_path || null
  })

  // --- Collage export ---
  // Saves a generated collage image (raw PNG bytes) to the OS Downloads folder.
  ipcMain.handle('collage:save', async (_e, data: { bytes: Uint8Array; filename: string }) => {
    try {
      const downloadsDir = app.getPath('downloads')

      // Sanitize the filename to prevent path traversal and ensure a .png extension.
      let base = (data.filename || 'collage').replace(/[^a-zA-Z0-9._-]/g, '_')
      if (!base.toLowerCase().endsWith('.png')) base += '.png'

      const filePath = resolve(downloadsDir, base)
      /* v8 ignore next 3 -- defensive: `base` is sanitized above so it can never escape downloadsDir */
      if (filePath !== downloadsDir && !filePath.startsWith(downloadsDir + sep)) {
        throw new Error('Invalid filename')
      }

      await writeFile(filePath, Buffer.from(data.bytes))
      return { success: true, path: filePath }
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) }
    }
  })

  // --- Audio Cache ---
  ipcMain.handle('cache:audio:save', async (_e, data: { itemId: string; url: string; quality: string }) => {
    if (!isSafeId(data?.itemId) || !isSafeId(data?.quality) || !isHttpUrl(data?.url)) return null
    const filePath = join(CACHE_AUDIO_DIR, `${data.itemId}_${data.quality}.audio`)
    try {
      const resp = await fetch(data.url)
      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`)

      await pipeline(Readable.fromWeb(resp.body as any), createWriteStream(filePath))

      const stats = statSync(filePath)
      db.prepare(`INSERT OR REPLACE INTO audio_cache (item_id, quality, file_path, file_size, last_accessed) VALUES (?, ?, ?, ?, datetime('now'))`).run(
        data.itemId, data.quality, filePath, stats.size
      )

      enforceCacheLimit()
      return filePath
    } catch (err) {
      console.warn('[main] audio cache save failed', data.itemId, err)
      try { if (existsSync(filePath)) unlinkSync(filePath) } catch { /* best effort */ }
      return null
    }
  })

  ipcMain.handle('cache:audio:get', (_e, itemId: string) => {
    const row = db.prepare('SELECT file_path FROM audio_cache WHERE item_id = ? ORDER BY last_accessed DESC LIMIT 1').get(itemId) as { file_path: string } | undefined
    if (row?.file_path && resolveInside(row.file_path, [CACHE_AUDIO_DIR]) && existsSync(row.file_path)) {
      db.prepare(`UPDATE audio_cache SET last_accessed = datetime('now') WHERE item_id = ?`).run(itemId)
      return row.file_path
    }
    return null
  })

  ipcMain.handle('app:get-version', () => app.getVersion())

  ipcMain.handle('cache:clear', () => {
    const rows = db.prepare('SELECT file_path FROM audio_cache').all() as { file_path: string }[]
    for (const row of rows) safeUnlink(row.file_path, [CACHE_AUDIO_DIR])
    db.prepare('DELETE FROM audio_cache').run()
  })

  // --- Settings ---
  ipcMain.handle('settings:get', (_e, key: string) => {
    if (typeof key !== 'string' || lastfm.SECRET_SETTING_KEYS.includes(key)) return null
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value || null
  })

  ipcMain.handle('settings:set', (_e, key: string, value: string) => {
    if (typeof key !== 'string' || typeof value !== 'string') throw new Error('Invalid setting')
    if (lastfm.SECRET_SETTING_KEYS.includes(key)) throw new Error('Protected setting')
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
  })

  // --- Last.fm scrobbling ---
  ipcMain.handle('lastfm:get-status', () => lastfm.getStatus())
  ipcMain.handle('lastfm:set-credentials', (_e, apiKey: string, apiSecret: string) => lastfm.setCredentials(apiKey, apiSecret))
  ipcMain.handle('lastfm:set-enabled', (_e, enabled: boolean) => lastfm.setEnabled(enabled))
  ipcMain.handle('lastfm:start-auth', () => lastfm.startAuth())
  ipcMain.handle('lastfm:finish-auth', (_e, token: string) => lastfm.finishAuth(token))
  ipcMain.handle('lastfm:disconnect', () => lastfm.disconnect())
  ipcMain.handle('lastfm:now-playing', (_e, track: LastfmTrack) => lastfm.updateNowPlaying(track))
  ipcMain.handle('lastfm:scrobble', (_e, track: LastfmTrack) => lastfm.scrobble(track))
  ipcMain.handle('lastfm:get-similar-tracks', (_e, track: { artist: string; track: string }, limit?: number) => lastfm.getSimilarTracks(track.artist, track.track, limit))
  ipcMain.handle('lastfm:get-info', (_e, method: string, params: Record<string, string>) => lastfm.getInfo(method, params))

  // --- Lyrics Cache ---
  ipcMain.handle('lyrics:get', (_e, itemId: string) => {
    const row = db.prepare('SELECT lyrics FROM lyrics_cache WHERE item_id = ?').get(itemId) as { lyrics: string } | undefined
    return row?.lyrics || null
  })

  ipcMain.handle('lyrics:save', (_e, itemId: string, lyrics: string) => {
    db.prepare('INSERT OR REPLACE INTO lyrics_cache (item_id, lyrics) VALUES (?, ?)').run(itemId, lyrics)
  })

  // --- Downloaded Lyrics (persistent, for offline) ---
  ipcMain.handle('lyrics:get-downloaded', (_e, itemId: string) => {
    const row = db.prepare('SELECT lyrics FROM downloaded_lyrics WHERE item_id = ?').get(itemId) as { lyrics: string } | undefined
    return row?.lyrics || null
  })

  ipcMain.handle('lyrics:save-downloaded', (_e, itemId: string, lyrics: string) => {
    db.prepare('INSERT OR REPLACE INTO downloaded_lyrics (item_id, lyrics) VALUES (?, ?)').run(itemId, lyrics)
  })

  // --- File protocol for cached/downloaded audio ---
  ipcMain.handle('file:get-url', (_e, filePath: unknown) => {
    const safe = resolveInside(filePath, [DOWNLOADS_DIR, CACHE_DIR])
    if (safe && existsSync(safe)) return toLocalAudioUrl(safe)
    return null
  })
}

/** Delete a file only if it lives inside one of the app-owned roots. */
function safeUnlink(filePath: string | undefined, roots: string[]) {
  const safe = resolveInside(filePath, roots)
  if (!safe) {
    if (filePath) console.warn('[main] refusing to delete path outside app dirs:', filePath)
    return
  }
  try {
    if (existsSync(safe)) unlinkSync(safe)
  } catch (err) {
    console.warn('[main] failed to delete', safe, err)
  }
}

const MAX_CACHE_SIZE = 2 * 1024 * 1024 * 1024 // 2GB

function enforceCacheLimit() {
  const db = getDatabase()
  const totalRow = db.prepare('SELECT COALESCE(SUM(file_size), 0) as total FROM audio_cache').get() as { total: number }
  if (totalRow.total <= MAX_CACHE_SIZE) return

  const overflow = totalRow.total - MAX_CACHE_SIZE
  const rows = db.prepare('SELECT item_id, quality, file_path, file_size FROM audio_cache ORDER BY last_accessed ASC').all() as {
    item_id: string; quality: string; file_path: string; file_size: number
  }[]

  let freed = 0
  for (const row of rows) {
    if (freed >= overflow) break
    safeUnlink(row.file_path, [CACHE_AUDIO_DIR])
    db.prepare('DELETE FROM audio_cache WHERE item_id = ? AND quality = ?').run(row.item_id, row.quality)
    freed += row.file_size
  }
}

app.whenReady().then(() => {
  initPaths()
  ensureDirs()
  initDatabase()
  clearSessionCaches()
  setupIPC()
  setupCors()
  lastfm.startScrobbleQueue()

  // Serve cached/downloaded audio; only files inside the app's own dirs.
  session.defaultSession.protocol.handle('local-audio', (request) => {
    let decoded = ''
    try {
      decoded = decodeURIComponent(request.url.replace('local-audio://', ''))
    } catch {
      return new Response('Bad request', { status: 400 })
    }
    const filePath = resolveInside(decoded, [DOWNLOADS_DIR, CACHE_DIR])
    if (!filePath) return new Response('Forbidden', { status: 403 })
    return net.fetch(pathToFileURL(filePath).toString(), { headers: request.headers })
  })

  createWindow()

  if (mainWindow) {
    initAutoUpdater(mainWindow)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
