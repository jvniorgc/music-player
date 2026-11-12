import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as social from './social'
import { jellyfin } from './jellyfin'
import { jsonRes, emptyRes, textRes, mockFetchRouter } from '@test/http'

const req = (over: Partial<social.AlbumRequest> = {}): social.AlbumRequest => ({
  id: 1, title: 'OK Computer', artist: 'Radiohead', year: '1997', mbReleaseId: null, coverUrl: null, note: null,
  status: 'pending', adminNote: null, requestedBy: { id: 'u1', name: 'Ana' }, createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z', votes: 1, votedByMe: true, voters: [{ id: 'u1', name: 'Ana' }], ...over,
})

beforeEach(() => {
  window.api.allowOrigin = vi.fn().mockResolvedValue(undefined)
  jellyfin.setAuth({ serverUrl: 'http://jf:8096', token: 'tok', userId: 'u1', username: 'ana', serverId: 's' } as never)
  social.configure('http://social:8099/')
})

describe('config', () => {
  it('normalizes, persists and allows the origin', () => {
    expect(social.getConfig()).toEqual({ url: 'http://social:8099' })
    expect(social.isConfigured()).toBe(true)
    expect(window.api.setSetting).toHaveBeenCalledWith('socialServerUrl', 'http://social:8099')
    expect(window.api.allowOrigin).toHaveBeenCalledWith('http://social:8099')
  })

  it('tolerates allowOrigin rejection and empty url', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(window.api.allowOrigin!).mockRejectedValueOnce(new Error('x'))
    social.configure('http://x')
    await Promise.resolve(); await Promise.resolve()
    expect(warn).toHaveBeenCalled()
    social.configure('')
    expect(social.isConfigured()).toBe(false)
  })

  it('tolerates setSetting rejection', async () => {
    vi.mocked(window.api.setSetting).mockRejectedValueOnce(new Error('x'))
    social.configure('http://y')
    await Promise.resolve()
    expect(social.getConfig().url).toBe('http://y')
  })

  it('derives the default url', () => {
    expect(social.deriveDefaultUrl('https://music.home/jf/')).toBe('https://music.home/jf/mp-api')
    expect(social.deriveDefaultUrl('http://10.0.0.2:8096')).toBe('http://10.0.0.2:8096/mp-api')
    expect(social.deriveDefaultUrl('nope')).toBe('')
  })

  it('autoDetect configures the /mp-api subpath when it answers', async () => {
    social.configure('')
    mockFetchRouter([['/mp-api/health', jsonRes({ ok: true })]])
    expect(await social.autoDetect('https://music.home')).toBe(true)
    expect(social.getConfig().url).toBe('https://music.home/mp-api')
  })

  it('autoDetect leaves config alone when unreachable, invalid or already set', async () => {
    social.configure('')
    mockFetchRouter([['/mp-api/health', jsonRes({}, 404)]])
    expect(await social.autoDetect('https://music.home')).toBe(false)
    expect(social.getConfig().url).toBe('')
    expect(await social.autoDetect('nope')).toBe(false)
    social.configure('http://manual')
    expect(await social.autoDetect('https://music.home')).toBe(false)
    expect(social.getConfig().url).toBe('http://manual')
  })

  it('loads the persisted url', async () => {
    vi.mocked(window.api.getSetting).mockResolvedValueOnce('http://saved:8099')
    await social.loadConfig()
    expect(social.getConfig().url).toBe('http://saved:8099')
    vi.mocked(window.api.getSetting).mockResolvedValueOnce(null)
    await social.loadConfig()
    expect(social.getConfig().url).toBe('http://saved:8099')
    vi.mocked(window.api.getSetting).mockRejectedValueOnce(new Error('x'))
    await social.loadConfig()
    expect(social.getConfig().url).toBe('http://saved:8099')
  })
})

describe('api', () => {
  it('testConnection hits /health', async () => {
    const f = mockFetchRouter([['/health', jsonRes({ ok: true })]])
    expect(await social.testConnection('http://other:8099/')).toBe(true)
    expect(f.mock.calls[0][0]).toBe('http://other:8099/health')
    mockFetchRouter([['/health', textRes('Healthy')]])
    expect(await social.testConnection('http://jellyfin:8096')).toBe(false)
    mockFetchRouter([['/health', jsonRes({}, 500)]])
    expect(await social.testConnection('http://other')).toBe(false)
    mockFetchRouter([['/health', () => { throw new Error('down') }]])
    expect(await social.testConnection('http://other')).toBe(false)
  })

  it('getMe sends the Jellyfin auth header', async () => {
    const f = mockFetchRouter([['/me', jsonRes({ id: 'u1', name: 'Ana', isAdmin: true })]])
    expect(await social.getMe()).toEqual({ id: 'u1', name: 'Ana', isAdmin: true })
    const init = f.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe('MediaBrowser Token="tok"')
  })

  it('listRequests with and without status', async () => {
    const f = mockFetchRouter([['/requests', () => jsonRes({ items: [req()] })]])
    expect(await social.listRequests()).toHaveLength(1)
    expect(f.mock.calls[0][0]).toBe('http://social:8099/requests')
    await social.listRequests('approved')
    expect(f.mock.calls[1][0]).toBe('http://social:8099/requests?status=approved')
  })

  it('createRequest posts and returns the request', async () => {
    const f = mockFetchRouter([['/requests', jsonRes(req(), 201)]])
    expect((await social.createRequest({ title: 'OK Computer', artist: 'Radiohead' })).id).toBe(1)
    const init = f.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ title: 'OK Computer', artist: 'Radiohead' })
  })

  it('createRequest throws DuplicateRequestError on 409', async () => {
    mockFetchRouter([['/requests', jsonRes({ error: 'duplicate', request: req({ id: 7 }) }, 409)]])
    const err = await social.createRequest({ title: 'a', artist: 'b' }).catch(e => e)
    expect(err).toBeInstanceOf(social.DuplicateRequestError)
    expect(err.request.id).toBe(7)
  })

  it('vote / unvote / update / delete', async () => {
    const f = mockFetchRouter([
      ['/requests/1/vote', jsonRes(req())],
      ['/requests/1', (_u, init) => init?.method === 'DELETE' ? emptyRes() : jsonRes(req({ status: 'approved' }))],
    ])
    await social.vote(1)
    expect((f.mock.calls[0][1] as RequestInit).method).toBe('POST')
    await social.unvote(1)
    expect((f.mock.calls[1][1] as RequestInit).method).toBe('DELETE')
    expect((await social.updateRequest(1, { status: 'approved', adminNote: 'ok' })).status).toBe('approved')
    expect(JSON.parse((f.mock.calls[2][1] as RequestInit).body as string)).toEqual({ status: 'approved', adminNote: 'ok' })
    await expect(social.deleteRequest(1)).resolves.toBeUndefined()
  })

  it('throws SocialApiError with server message', async () => {
    mockFetchRouter([['/requests/2', jsonRes({ error: 'forbidden' }, 403)]])
    const err = await social.updateRequest(2, { status: 'rejected' }).catch(e => e)
    expect(err).toBeInstanceOf(social.SocialApiError)
    expect(err.status).toBe(403)
    expect(err.message).toBe('forbidden')
    mockFetchRouter([['/requests/2', textRes('boom', 500)]])
    const err2 = await social.deleteRequest(2).catch(e => e)
    expect(err2.message).toBe('Social server error: 500')
  })

  it('throws when not configured', async () => {
    social.configure('')
    await expect(social.getMe()).rejects.toThrow('not configured')
  })
})
