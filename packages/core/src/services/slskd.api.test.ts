import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  configure,
  startSearch,
  getSearch,
  getSearchResponses,
  deleteSearch,
  downloadFiles,
  getDownloads,
  removeDownload,
  removeCompletedDownloads,
  getApplicationInfo,
} from './slskd'
import { jsonRes, emptyRes, textRes } from '@test/http'

beforeEach(() => {
  configure({ url: 'http://slskd:5030', username: 'u', password: 'p' })
})

describe('authentication flow', () => {
  it('authenticates once then reuses the bearer token across requests', async () => {
    let sessionCalls = 0
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url)
      if (u.endsWith('/api/v0/session')) {
        sessionCalls++
        return jsonRes({ token: 'TOK' })
      }
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer TOK')
      return jsonRes({ id: 's1', searchText: 'q', state: 'InProgress', responseCount: 0, fileCount: 0, isComplete: false })
    })
    vi.stubGlobal('fetch', fetchMock)

    await startSearch('q')
    await getSearch('s1')
    expect(sessionCalls).toBe(1)
  })

  it('re-authenticates and retries once on a 401', async () => {
    let sessionCalls = 0
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url)
      if (u.endsWith('/api/v0/session')) {
        sessionCalls++
        return jsonRes({ token: sessionCalls === 1 ? 'T1' : 'T2' })
      }
      const auth = (init?.headers as Record<string, string>).Authorization
      if (auth === 'Bearer T1') return emptyRes(401)
      return jsonRes({ id: 's1', searchText: 'q', state: 'Completed', responseCount: 1, fileCount: 1, isComplete: true })
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = await getSearch('s1')
    expect(res.isComplete).toBe(true)
    expect(sessionCalls).toBe(2)
  })

  it('throws when slskd is not configured', async () => {
    configure({ url: '', username: 'u', password: 'p' })
    await expect(getDownloads()).rejects.toThrow('slskd not configured')
  })

  it('surfaces non-401 API errors with status and body', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/api/v0/session')) return jsonRes({ token: 'T' })
      return textRes('boom', 500)
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(getSearch('s1')).rejects.toThrow('slskd API error: 500 - boom')
  })
})

describe('search and transfer endpoints', () => {
  beforeEach(() => {
    // Pre-authenticate by stubbing a session + generic JSON for everything else.
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url)
      if (u.endsWith('/api/v0/session')) return jsonRes({ token: 'T' })
      if (u.includes('/searches') && init?.method === 'POST') {
        return jsonRes({ id: 'newid', searchText: 'q', state: 'InProgress', responseCount: 0, fileCount: 0, isComplete: false })
      }
      if (u.includes('/responses')) return jsonRes([{ username: 'bob', files: [], fileCount: 0 }])
      if (u.includes('/transfers/downloads') && init?.method === 'POST') return emptyRes(204)
      if (u.includes('/transfers/downloads') && init?.method === 'DELETE') return emptyRes(204)
      if (u.includes('/transfers/downloads')) return jsonRes([{ username: 'bob', directories: [] }])
      if (u.includes('/application')) return jsonRes({ server: { isConnected: true, isLoggedIn: true } })
      return emptyRes(204)
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  it('startSearch sends a generated id', async () => {
    const res = await startSearch('hello')
    expect(res.id).toBe('newid')
    const body = JSON.parse((globalThis.fetch as any).mock.calls.at(-1)[1].body)
    expect(body.searchText).toBe('hello')
    expect(typeof body.id).toBe('string')
  })

  it('getSearchResponses returns the response list', async () => {
    const res = await getSearchResponses('s1')
    expect(res[0].username).toBe('bob')
  })

  it('downloadFiles POSTs to the user transfers endpoint and resolves on 204', async () => {
    await expect(downloadFiles('bob', [{ filename: 'a.flac', size: 10 }])).resolves.toBeUndefined()
  })

  it('getDownloads returns transfer groups', async () => {
    const groups = await getDownloads()
    expect(groups[0].username).toBe('bob')
  })

  it('removeDownload resolves on 204', async () => {
    await expect(removeDownload('bob', 't1')).resolves.toBeUndefined()
  })

  it('deleteSearch resolves on 204', async () => {
    await expect(deleteSearch('s1')).resolves.toBeUndefined()
  })

  it('removeCompletedDownloads resolves on 204', async () => {
    await expect(removeCompletedDownloads()).resolves.toBeUndefined()
  })

  it('getApplicationInfo returns server status', async () => {
    const info = await getApplicationInfo()
    expect(info.server.isConnected).toBe(true)
  })
})
