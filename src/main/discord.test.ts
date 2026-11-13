import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

type Listener = (...a: unknown[]) => void

const h = vi.hoisted(() => ({
  userData: '',
  clients: [] as any[],
  loginImpl: null as null | (() => Promise<void>),
}))

vi.mock('electron', () => ({ app: { getPath: () => h.userData } }))

vi.mock('@xhayper/discord-rpc', () => {
  class Client {
    clientId: string
    listeners = new Map<string, Listener>()
    user = { setActivity: vi.fn().mockResolvedValue({}), clearActivity: vi.fn().mockResolvedValue(undefined) }
    login = vi.fn(() => (h.loginImpl ? h.loginImpl() : Promise.resolve()))
    destroy = vi.fn().mockResolvedValue(undefined)
    constructor(opts: { clientId: string }) {
      this.clientId = opts.clientId
      h.clients.push(this)
    }
    on(event: string, cb: Listener) { this.listeners.set(event, cb); return this }
    emit(event: string) { this.listeners.get(event)?.() }
  }
  return { Client }
})

let discord: typeof import('./discord')
let getDatabase: typeof import('./database')['getDatabase']
let tmpRoot = ''

const presence = { title: 'Song', artist: 'Band', album: 'LP', position: 10, duration: 200 }
const flush = () => new Promise(r => setTimeout(r, 0))

beforeAll(async () => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'mp-discord-'))
  h.userData = join(tmpRoot, 'userData')
  mkdirSync(h.userData, { recursive: true })
  const dbMod = await import('./database')
  dbMod.initDatabase()
  getDatabase = dbMod.getDatabase
  discord = await import('./discord')
})

afterAll(() => {
  try { rmSync(tmpRoot, { recursive: true, force: true }) } catch {}
})

beforeEach(async () => {
  await discord.shutdown()
  getDatabase().exec('DELETE FROM settings;')
  h.clients.length = 0
  h.loginImpl = null
})

afterEach(() => {
  vi.useRealTimers()
})

describe('enabled setting', () => {
  it('defaults to off and persists the toggle', () => {
    expect(discord.isEnabled()).toBe(false)
    discord.setEnabled(true)
    expect(discord.isEnabled()).toBe(true)
    discord.setEnabled(false)
    expect(discord.isEnabled()).toBe(false)
  })

  it('exposes a placeholder client id', () => {
    expect(discord.DISCORD_CLIENT_ID).toMatch(/^\d+$/)
  })
})

describe('setActivity', () => {
  it('does nothing (no connection) while disabled', async () => {
    await discord.setActivity(presence)
    expect(h.clients).toHaveLength(0)
  })

  it('connects lazily and sends a Listening activity without any Jellyfin URL', async () => {
    discord.setEnabled(true)
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    await discord.setActivity(presence)
    vi.mocked(Date.now).mockRestore()
    expect(h.clients).toHaveLength(1)
    const c = h.clients[0]
    expect(c.clientId).toBe(discord.DISCORD_CLIENT_ID)
    expect(c.login).toHaveBeenCalledTimes(1)
    expect(c.user.setActivity).toHaveBeenCalledWith({
      type: 2,
      details: 'Song',
      state: 'Band',
      largeImageKey: discord.LARGE_IMAGE_KEY,
      largeImageText: 'LP',
      statusDisplayType: 1,
      startTimestamp: 1_000_000 - 10_000,
      endTimestamp: 1_000_000 + 190_000,
      instance: false,
    })
    // Reuses the connection.
    await discord.setActivity({ ...presence, album: undefined, duration: 0 })
    expect(h.clients).toHaveLength(1)
    const second = c.user.setActivity.mock.calls[1][0]
    expect(second.endTimestamp).toBeUndefined()
    expect(second.largeImageText).toBeUndefined()
  })

  it('uses a public https cover as the large image, falling back to the app icon', async () => {
    discord.setEnabled(true)
    await discord.setActivity({ ...presence, imageUrl: 'https://music.example.com/Items/a/Images/Primary' })
    await discord.setActivity({ ...presence, imageUrl: 'http://192.168.0.2/Items/a/Images/Primary' })
    await discord.setActivity({ ...presence, imageUrl: `https://x.com/${'a'.repeat(300)}` })
    const calls = h.clients[0].user.setActivity.mock.calls.map((c: [{ largeImageKey: string }]) => c[0].largeImageKey)
    expect(calls).toEqual(['https://music.example.com/Items/a/Images/Primary', discord.LARGE_IMAGE_KEY, discord.LARGE_IMAGE_KEY])
  })

  it('pads too-short fields required by Discord and truncates long ones', async () => {
    discord.setEnabled(true)
    await discord.setActivity({ title: 'A', artist: '', position: 0, duration: 0, album: 'x'.repeat(200) })
    const sent = h.clients[0].user.setActivity.mock.calls[0][0]
    expect(sent.details).toBe('A ')
    expect(sent.state).toBeUndefined()
    expect(sent.largeImageText).toHaveLength(128)
  })

  it('clears the activity when given null (pause/stop)', async () => {
    discord.setEnabled(true)
    await discord.setActivity(presence)
    await discord.setActivity(null)
    expect(h.clients[0].user.clearActivity).toHaveBeenCalled()
  })

  it('does not connect just to clear an activity', async () => {
    discord.setEnabled(true)
    await discord.setActivity(null)
    expect(h.clients).toHaveLength(0)
  })

  it('swallows errors from Discord calls', async () => {
    discord.setEnabled(true)
    await discord.setActivity(presence)
    h.clients[0].user.setActivity.mockRejectedValueOnce(new Error('pipe closed'))
    await expect(discord.setActivity(presence)).resolves.toBeUndefined()
    h.clients[0].user.clearActivity.mockRejectedValueOnce(new Error('pipe closed'))
    await expect(discord.setActivity(null)).resolves.toBeUndefined()
  })
})

describe('reconnect / backoff', () => {
  it('retries silently with backoff when Discord is not running', async () => {
    vi.useFakeTimers()
    discord.setEnabled(true)
    h.loginImpl = () => Promise.reject(new Error('Could not connect'))
    await discord.setActivity(presence)
    expect(h.clients).toHaveLength(1)
    expect(h.clients[0].destroy).toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(discord.RETRY_BASE_MS)
    expect(h.clients).toHaveLength(2)

    // Second failure doubles the delay.
    await vi.advanceTimersByTimeAsync(discord.RETRY_BASE_MS)
    expect(h.clients).toHaveLength(2)
    h.loginImpl = null
    await vi.advanceTimersByTimeAsync(discord.RETRY_BASE_MS)
    expect(h.clients).toHaveLength(3)
    expect(h.clients[2].user.setActivity).toHaveBeenCalled()
  })

  it('caps the backoff delay', async () => {
    vi.useFakeTimers()
    discord.setEnabled(true)
    h.loginImpl = () => Promise.reject(new Error('nope'))
    await discord.setActivity(presence)
    for (let i = 0; i < 10; i++) await vi.advanceTimersByTimeAsync(discord.RETRY_MAX_MS)
    const n = h.clients.length
    await vi.advanceTimersByTimeAsync(discord.RETRY_MAX_MS)
    expect(h.clients.length).toBe(n + 1)
  })

  it('tolerates destroy() failing after a failed login', async () => {
    discord.setEnabled(true)
    h.loginImpl = () => Promise.reject(new Error('nope'))
    const orig = h.clients.push.bind(h.clients)
    h.clients.push = (c: any) => { c.destroy.mockRejectedValue(new Error('x')); return orig(c) }
    await expect(discord.setActivity(presence)).resolves.toBeUndefined()
    h.clients.push = orig
  })

  it('stops retrying when the activity is cleared', async () => {
    vi.useFakeTimers()
    discord.setEnabled(true)
    h.loginImpl = () => Promise.reject(new Error('nope'))
    await discord.setActivity(presence)
    await discord.setActivity(null)
    await vi.advanceTimersByTimeAsync(discord.RETRY_MAX_MS * 2)
    expect(h.clients).toHaveLength(1)
  })

  it('reconnects after Discord disconnects and re-sends the last activity', async () => {
    vi.useFakeTimers()
    discord.setEnabled(true)
    await discord.setActivity(presence)
    h.clients[0].emit('disconnected')
    await vi.advanceTimersByTimeAsync(discord.RETRY_BASE_MS)
    expect(h.clients).toHaveLength(2)
    expect(h.clients[1].user.setActivity).toHaveBeenCalled()
  })

  it('does not reconnect after a disconnect when nothing is playing', async () => {
    vi.useFakeTimers()
    discord.setEnabled(true)
    await discord.setActivity(presence)
    await discord.setActivity(null)
    h.clients[0].emit('disconnected')
    await vi.advanceTimersByTimeAsync(discord.RETRY_MAX_MS)
    expect(h.clients).toHaveLength(1)
  })

  it('ignores a disconnect from a stale client', async () => {
    discord.setEnabled(true)
    await discord.setActivity(presence)
    const stale = h.clients[0]
    await discord.shutdown()
    stale.emit('disconnected')
    expect(h.clients).toHaveLength(1)
  })

  it('drops a connection that finishes after being disabled', async () => {
    discord.setEnabled(true)
    let resolve!: () => void
    h.loginImpl = () => new Promise<void>(r => { resolve = r })
    const p = discord.setActivity(presence)
    await flush()
    discord.setEnabled(false)
    resolve()
    await p
    expect(h.clients[0].user.setActivity).not.toHaveBeenCalled()
    expect(h.clients[0].destroy).toHaveBeenCalled()
  })

  it('shares one in-flight connection between concurrent updates', async () => {
    discord.setEnabled(true)
    await Promise.all([discord.setActivity(presence), discord.setActivity({ ...presence, title: 'Other' })])
    expect(h.clients).toHaveLength(1)
  })
})

describe('disable and shutdown', () => {
  it('disabling clears the activity and disconnects', async () => {
    discord.setEnabled(true)
    await discord.setActivity(presence)
    const c = h.clients[0]
    discord.setEnabled(false)
    await flush()
    expect(c.user.clearActivity).toHaveBeenCalled()
    expect(c.destroy).toHaveBeenCalled()
  })

  it('shutdown never throws even if Discord errors', async () => {
    discord.setEnabled(true)
    await discord.setActivity(presence)
    h.clients[0].user.clearActivity.mockRejectedValueOnce(new Error('x'))
    h.clients[0].destroy.mockRejectedValueOnce(new Error('y'))
    await expect(discord.shutdown()).resolves.toBeUndefined()
  })

  it('shutdown cancels a pending retry', async () => {
    vi.useFakeTimers()
    discord.setEnabled(true)
    h.loginImpl = () => Promise.reject(new Error('nope'))
    await discord.setActivity(presence)
    await discord.shutdown()
    await vi.advanceTimersByTimeAsync(discord.RETRY_MAX_MS)
    expect(h.clients).toHaveLength(1)
  })
})
