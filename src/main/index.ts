import { app, BrowserWindow, ipcMain, shell, session, net, Menu } from 'electron'
import { join } from 'path'
import { initDatabase, getDatabase } from './database'
import { existsSync, mkdirSync, createWriteStream, unlinkSync, statSync, readdirSync } from 'fs'
import { Readable } from 'stream'

let mainWindow: BrowserWindow | null = null

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
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: '#000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function setupIPC() {
  const db = getDatabase()

  // --- Auth persistence ---
  ipcMain.handle('db:get-auth', () => {
    const row = db.prepare('SELECT * FROM auth LIMIT 1').get() as Record<string, unknown> | undefined
    return row || null
  })

  ipcMain.handle('db:save-auth', (_e, data: { serverUrl: string; token: string; userId: string; username: string; serverId: string }) => {
    db.prepare('DELETE FROM auth').run()
    db.prepare('INSERT INTO auth (server_url, token, user_id, username, server_id) VALUES (?, ?, ?, ?, ?)').run(
      data.serverUrl, data.token, data.userId, data.username, data.serverId
    )
  })

  ipcMain.handle('db:clear-auth', () => {
    db.prepare('DELETE FROM auth').run()
  })

  // --- Downloads ---
  ipcMain.handle('download:start', async (_e, data: { itemId: string; url: string; filename: string; metadata: string }) => {
    const filePath = join(DOWNLOADS_DIR, `${data.itemId}.audio`)
    try {
      db.prepare(`INSERT OR REPLACE INTO downloads (item_id, file_path, filename, metadata, status) VALUES (?, ?, ?, ?, 'downloading')`).run(
        data.itemId, filePath, data.filename, data.metadata
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
      writer.end()

      db.prepare(`UPDATE downloads SET status = 'completed', file_size = ? WHERE item_id = ?`).run(downloadedBytes, data.itemId)
      mainWindow?.webContents.send('download:complete', { itemId: data.itemId })
      return { success: true }
    } catch (err: any) {
      db.prepare(`UPDATE downloads SET status = 'failed' WHERE item_id = ?`).run(data.itemId)
      mainWindow?.webContents.send('download:error', { itemId: data.itemId, error: err.message })
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('download:remove', (_e, itemId: string) => {
    const row = db.prepare('SELECT file_path FROM downloads WHERE item_id = ?').get(itemId) as { file_path: string } | undefined
    if (row?.file_path && existsSync(row.file_path)) {
      unlinkSync(row.file_path)
    }
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

  // --- Audio Cache ---
  ipcMain.handle('cache:audio:save', async (_e, data: { itemId: string; url: string; quality: string }) => {
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
    } catch {
      return null
    }
  })

  ipcMain.handle('cache:audio:get', (_e, itemId: string) => {
    const row = db.prepare('SELECT file_path FROM audio_cache WHERE item_id = ? ORDER BY last_accessed DESC LIMIT 1').get(itemId) as { file_path: string } | undefined
    if (row?.file_path && existsSync(row.file_path)) {
      db.prepare(`UPDATE audio_cache SET last_accessed = datetime('now') WHERE item_id = ?`).run(itemId)
      return row.file_path
    }
    return null
  })

  ipcMain.handle('cache:clear', () => {
    const rows = db.prepare('SELECT file_path FROM audio_cache').all() as { file_path: string }[]
    for (const row of rows) {
      if (existsSync(row.file_path)) unlinkSync(row.file_path)
    }
    db.prepare('DELETE FROM audio_cache').run()
  })

  // --- Settings ---
  ipcMain.handle('settings:get', (_e, key: string) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value || null
  })

  ipcMain.handle('settings:set', (_e, key: string, value: string) => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
  })

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
  ipcMain.handle('file:get-url', (_e, filePath: string) => {
    if (existsSync(filePath)) {
      return `file://${filePath}`
    }
    return null
  })
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
    if (existsSync(row.file_path)) unlinkSync(row.file_path)
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

  // Handle file protocol for local audio playback via custom scheme
  session.defaultSession.protocol.handle('local-audio', (request) => {
    const filePath = decodeURIComponent(request.url.replace('local-audio://', ''))
    return net.fetch(`file://${filePath}`)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
