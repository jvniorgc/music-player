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
