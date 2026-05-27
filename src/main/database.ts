import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'

let db: Database.Database

export function initDatabase(): void {
  const dbPath = join(app.getPath('userData'), 'music-player.db')
  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS auth (
      id INTEGER PRIMARY KEY DEFAULT 1,
      server_url TEXT NOT NULL,
      token TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      server_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS downloads (
      item_id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      filename TEXT NOT NULL,
      metadata TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      file_size INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audio_cache (
      item_id TEXT NOT NULL,
      quality TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      last_accessed DATETIME DEFAULT (datetime('now')),
      PRIMARY KEY (item_id, quality)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS lyrics_cache (
      item_id TEXT PRIMARY KEY,
      lyrics TEXT NOT NULL,
      created_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS downloaded_lyrics (
      item_id TEXT PRIMARY KEY,
      lyrics TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playlist_ownership (
      server_id TEXT NOT NULL,
      playlist_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at DATETIME DEFAULT (datetime('now')),
      PRIMARY KEY (server_id, playlist_id)
    );

    CREATE TABLE IF NOT EXISTS playback_state (
      id INTEGER PRIMARY KEY DEFAULT 1,
      queue TEXT,
      current_index INTEGER DEFAULT 0,
      position REAL DEFAULT 0,
      volume REAL DEFAULT 1,
      shuffle INTEGER DEFAULT 0,
      repeat_mode TEXT DEFAULT 'none'
    );
  `)
}

export function getDatabase(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}
