import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const h = vi.hoisted(() => ({ userData: '' }))

vi.mock('electron', () => ({
  app: { getPath: () => h.userData }
}))

let mod: typeof import('./database')
let tmpRoot = ''

beforeAll(async () => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'mp-db-'))
  h.userData = tmpRoot
  mod = await import('./database')
})

afterAll(() => {
  try { rmSync(tmpRoot, { recursive: true, force: true }) } catch {}
})

describe('database', () => {
  it('throws if accessed before initialization', () => {
    expect(() => mod.getDatabase()).toThrow('Database not initialized')
  })

  it('initializes the schema with all expected tables', () => {
    mod.initDatabase()
    const db = mod.getDatabase()
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
      .map(r => r.name)
    for (const t of ['auth', 'downloads', 'audio_cache', 'settings', 'lyrics_cache', 'downloaded_lyrics', 'playback_state']) {
      expect(names).toContain(t)
    }
  })

  it('enables WAL journaling and foreign keys', () => {
    const db = mod.getDatabase()
    expect(String(db.pragma('journal_mode', { simple: true })).toLowerCase()).toBe('wal')
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
  })

  it('is idempotent (CREATE TABLE IF NOT EXISTS)', () => {
    expect(() => mod.initDatabase()).not.toThrow()
  })
})

describe('database migrations', () => {
  it('records the schema version and creates the scrobble queue', () => {
    const db = mod.getDatabase()
    expect(db.pragma('user_version', { simple: true })).toBe(mod.SCHEMA_VERSION)
    expect(mod.SCHEMA_VERSION).toBeGreaterThanOrEqual(2)
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(r => r.name)
    expect(names).toContain('scrobble_queue')
  })

  it('upgrades a pre-versioning (v0) install without losing data', async () => {
    const Database = (await import('better-sqlite3')).default
    const legacy = new Database(':memory:')
    // Tables as created by the original unversioned schema, with user data.
    legacy.exec(`
      CREATE TABLE auth (id INTEGER PRIMARY KEY DEFAULT 1, server_url TEXT NOT NULL, token TEXT NOT NULL, user_id TEXT NOT NULL, username TEXT NOT NULL, server_id TEXT NOT NULL);
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
      INSERT INTO auth (server_url, token, user_id, username, server_id) VALUES ('http://s', 't', 'u', 'n', 'sid');
      INSERT INTO settings VALUES ('theme', 'dark');
    `)
    expect(legacy.pragma('user_version', { simple: true })).toBe(0)

    mod.migrate(legacy)

    expect(legacy.pragma('user_version', { simple: true })).toBe(mod.SCHEMA_VERSION)
    expect(legacy.prepare('SELECT username FROM auth').get()).toEqual({ username: 'n' })
    expect(legacy.prepare("SELECT value FROM settings WHERE key = 'theme'").get()).toEqual({ value: 'dark' })
    expect(() => legacy.prepare('SELECT * FROM scrobble_queue').all()).not.toThrow()
    expect(() => legacy.prepare('SELECT * FROM playback_state').all()).not.toThrow()

    // Re-running is a no-op.
    expect(() => mod.migrate(legacy)).not.toThrow()
    legacy.close()
  })

  it('applies only the missing steps for a v1 database', async () => {
    const Database = (await import('better-sqlite3')).default
    const v1 = new Database(':memory:')
    v1.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)')
    v1.pragma('user_version = 1')
    mod.migrate(v1)
    expect(v1.pragma('user_version', { simple: true })).toBe(2)
    expect(() => v1.prepare('SELECT * FROM scrobble_queue').all()).not.toThrow()
    v1.close()
  })
})
