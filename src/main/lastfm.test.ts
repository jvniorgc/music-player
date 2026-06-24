import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createHash } from 'node:crypto'

const h = vi.hoisted(() => ({
  userData: '',
  fetchMock: null as null | ReturnType<typeof vi.fn>,
  openExternal: null as null | ReturnType<typeof vi.fn>,
}))

vi.mock('electron', () => {
  const fetchMock = vi.fn()
  const openExternal = vi.fn().mockResolvedValue(undefined)
  h.fetchMock = fetchMock
  h.openExternal = openExternal
  return {
    app: { getPath: () => h.userData },
    net: { fetch: fetchMock },
    shell: { openExternal },
  }
})

let lastfm: typeof import('./lastfm')
let getDatabase: typeof import('./database')['getDatabase']
let tmpRoot = ''

function jsonRes(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })
}

/** Parse the params a captured fetch call sent (GET query or POST body). */
function sentParams(call: unknown[]): URLSearchParams {
  const [url, init] = call as [string, RequestInit | undefined]
  if (init?.method === 'POST') return new URLSearchParams(String(init.body))
  return new URLSearchParams(url.split('?')[1])
}

beforeAll(async () => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'mp-lastfm-'))
  h.userData = join(tmpRoot, 'userData')
  mkdirSync(h.userData, { recursive: true })
  const dbMod = await import('./database')
  dbMod.initDatabase()
  getDatabase = dbMod.getDatabase
  lastfm = await import('./lastfm')
})

afterAll(() => {
  try { rmSync(tmpRoot, { recursive: true, force: true }) } catch {}
})

beforeEach(() => {
  getDatabase().exec('DELETE FROM settings;')
  h.fetchMock!.mockReset()
})

describe('status and credentials', () => {
  it('reports an empty status by default', () => {
    expect(lastfm.getStatus()).toEqual({ configured: false, connected: false, enabled: false, username: null })
  })

  it('becomes configured after storing credentials', () => {
    lastfm.setCredentials('my-key', 'my-secret')
    expect(lastfm.getStatus()).toMatchObject({ configured: true, connected: false })
  })

  it('tracks the enabled flag', () => {
    lastfm.setEnabled(true)
    expect(lastfm.getStatus().enabled).toBe(true)
    lastfm.setEnabled(false)
    expect(lastfm.getStatus().enabled).toBe(false)
  })
})

describe('startAuth', () => {
  it('throws when credentials are missing', async () => {
    await expect(lastfm.startAuth()).rejects.toThrow(/not configured/i)
  })

  it('requests a token and opens the authorize page', async () => {
    lastfm.setCredentials('my-key', 'my-secret')
    h.fetchMock!.mockResolvedValueOnce(jsonRes({ token: 'abc123' }))

    const result = await lastfm.startAuth()

    expect(result).toEqual({ token: 'abc123' })
    const params = sentParams(h.fetchMock!.mock.calls[0])
    expect(params.get('method')).toBe('auth.getToken')
    expect(params.get('api_key')).toBe('my-key')
    expect(params.get('api_sig')).toBeTruthy()
    expect(h.openExternal).toHaveBeenCalledWith(expect.stringContaining('token=abc123'))
  })
})

describe('finishAuth', () => {
  it('exchanges the token for a session and stores it', async () => {
    lastfm.setCredentials('my-key', 'my-secret')
    h.fetchMock!.mockResolvedValueOnce(jsonRes({ session: { name: 'rj', key: 'sk-999' } }))

    const result = await lastfm.finishAuth('the-token')

    expect(result).toEqual({ username: 'rj' })
    expect(lastfm.getStatus()).toMatchObject({ connected: true, username: 'rj' })
  })

  it('throws when credentials are missing', async () => {
    await expect(lastfm.finishAuth('t')).rejects.toThrow(/not configured/i)
  })

  it('throws on a Last.fm error response', async () => {
    lastfm.setCredentials('my-key', 'my-secret')
    h.fetchMock!.mockResolvedValueOnce(jsonRes({ error: 4, message: 'Invalid token' }))
    await expect(lastfm.finishAuth('bad')).rejects.toThrow(/Invalid token/)
  })
})

describe('disconnect', () => {
  it('clears the session but keeps credentials', async () => {
    lastfm.setCredentials('my-key', 'my-secret')
    h.fetchMock!.mockResolvedValueOnce(jsonRes({ session: { name: 'rj', key: 'sk-999' } }))
    await lastfm.finishAuth('t')

    lastfm.disconnect()

    expect(lastfm.getStatus()).toMatchObject({ configured: true, connected: false, username: null })
  })
})

describe('updateNowPlaying / scrobble no-op guards', () => {
  async function link() {
    lastfm.setCredentials('my-key', 'my-secret')
    h.fetchMock!.mockResolvedValueOnce(jsonRes({ session: { name: 'rj', key: 'sk-999' } }))
    await lastfm.finishAuth('t')
    h.fetchMock!.mockReset()
  }

  it('does nothing when not configured', async () => {
    await lastfm.scrobble({ artist: 'A', track: 'B', timestamp: 1 })
    await lastfm.updateNowPlaying({ artist: 'A', track: 'B' })
    expect(h.fetchMock).not.toHaveBeenCalled()
  })

  it('does nothing when linked but disabled', async () => {
    await link()
    lastfm.setEnabled(false)
    await lastfm.scrobble({ artist: 'A', track: 'B', timestamp: 1 })
    expect(h.fetchMock).not.toHaveBeenCalled()
  })

  it('does nothing when enabled but not connected', async () => {
    lastfm.setCredentials('my-key', 'my-secret')
    lastfm.setEnabled(true)
    await lastfm.scrobble({ artist: 'A', track: 'B', timestamp: 1 })
    expect(h.fetchMock).not.toHaveBeenCalled()
  })
})

describe('scrobble / updateNowPlaying when linked and enabled', () => {
  async function link() {
    lastfm.setCredentials('my-key', 'my-secret')
    h.fetchMock!.mockResolvedValueOnce(jsonRes({ session: { name: 'rj', key: 'sk-999' } }))
    await lastfm.finishAuth('t')
    lastfm.setEnabled(true)
    h.fetchMock!.mockReset()
  }

  it('posts a signed scrobble with all metadata', async () => {
    await link()
    h.fetchMock!.mockResolvedValueOnce(jsonRes({ scrobbles: { '@attr': { accepted: 1 } } }))

    await lastfm.scrobble({ artist: 'Radiohead', track: 'Reckoner', album: 'In Rainbows', albumArtist: 'Radiohead', duration: 290, timestamp: 1700000000 })

    const [url, init] = h.fetchMock!.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://ws.audioscrobbler.com/2.0/')
    expect(init.method).toBe('POST')
    const p = new URLSearchParams(String(init.body))
    expect(p.get('method')).toBe('track.scrobble')
    expect(p.get('artist')).toBe('Radiohead')
    expect(p.get('album')).toBe('In Rainbows')
    expect(p.get('albumArtist')).toBe('Radiohead')
    expect(p.get('duration')).toBe('290')
    expect(p.get('timestamp')).toBe('1700000000')
    expect(p.get('sk')).toBe('sk-999')
    expect(p.get('format')).toBe('json')

    // Signature: md5 of sorted "key+value" pairs (excluding format/api_sig) + secret.
    const expectedSig = computeSig(p, 'my-secret')
    expect(p.get('api_sig')).toBe(expectedSig)
  })

  it('posts updateNowPlaying with only the required fields', async () => {
    await link()
    h.fetchMock!.mockResolvedValueOnce(jsonRes({ nowplaying: {} }))

    await lastfm.updateNowPlaying({ artist: 'Bjork', track: 'Joga' })

    const p = sentParams(h.fetchMock!.mock.calls[0])
    expect(p.get('method')).toBe('track.updateNowPlaying')
    expect(p.get('artist')).toBe('Bjork')
    expect(p.has('album')).toBe(false)
    expect(p.has('duration')).toBe(false)
  })

  it('defaults the scrobble timestamp to now when omitted', async () => {
    await link()
    h.fetchMock!.mockResolvedValueOnce(jsonRes({ scrobbles: {} }))
    const before = Math.floor(Date.now() / 1000)

    await lastfm.scrobble({ artist: 'A', track: 'B' })

    const p = sentParams(h.fetchMock!.mock.calls[0])
    expect(Number(p.get('timestamp'))).toBeGreaterThanOrEqual(before)
  })

  it('throws when Last.fm rejects the scrobble', async () => {
    await link()
    h.fetchMock!.mockResolvedValueOnce(jsonRes({ error: 9, message: 'Invalid session key' }))
    await expect(lastfm.scrobble({ artist: 'A', track: 'B', timestamp: 1 })).rejects.toThrow(/Invalid session key/)
  })
})

// Mirror of the implementation's signing rule, used to verify the request signature.
function computeSig(params: URLSearchParams, secret: string): string {
  const keys = [...params.keys()].filter(k => k !== 'format' && k !== 'api_sig').sort()
  let s = ''
  for (const k of keys) s += k + params.get(k)
  s += secret
  return createHash('md5').update(s, 'utf8').digest('hex')
}
