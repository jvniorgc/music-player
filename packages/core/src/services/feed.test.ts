import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as feed from './feed'
import * as social from './social'
import * as slskd from './slskd'
import { jellyfin } from './jellyfin'
import { useI18nStore } from '../i18n'
import { jsonRes, mockFetchRouter } from '@test/http'

beforeEach(() => {
  window.api.allowOrigin = vi.fn().mockResolvedValue(undefined)
  jellyfin.setAuth({ serverUrl: 'http://jf:8096', token: 'tok', userId: 'u1', username: 'ana', serverId: 's' } as never)
  social.configure('http://social:8099')
})
afterEach(() => {
  feed.stopWatching()
  vi.useRealTimers()
})

describe('getFeed', () => {
  it('requests the feed with optional cursor and limit', async () => {
    const fetch = mockFetchRouter([['/feed', jsonRes({ items: [{ id: 'x' }], nextBefore: null })]])
    expect(await feed.getFeed()).toEqual({ items: [{ id: 'x' }], nextBefore: null })
    expect(fetch.mock.calls[0][0]).toBe('http://social:8099/feed?limit=30')
    await feed.getFeed({ before: '2026-01-01T00:00:00Z', limit: 5 })
    expect(fetch.mock.calls[1][0]).toBe('http://social:8099/feed?limit=5&before=2026-01-01T00%3A00%3A00Z')
  })
})

describe('reportEvent', () => {
  it('posts when configured and swallows errors', async () => {
    const fetch = mockFetchRouter([['/events', () => { throw new Error('down') }]])
    feed.reportEvent({ type: 'soulseek_download', files: 2, folder: 'f' })
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toEqual({ type: 'soulseek_download', files: 2, folder: 'f' })
  })

  it('does nothing when not configured', () => {
    const fetch = mockFetchRouter([])
    vi.spyOn(social, 'isConfigured').mockReturnValueOnce(false)
    feed.reportEvent({ type: 'soulseek_download', files: 2, folder: 'f' })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('parseFolder', () => {
  it('extracts artist and album from the remote directory', () => {
    expect(feed.parseFolder('@@x\\Music\\Radiohead - OK Computer (1997)\\01.flac'))
      .toEqual({ folder: 'Radiohead - OK Computer (1997)', artist: 'Radiohead', albumName: 'OK Computer (1997)' })
    expect(feed.parseFolder('Music/Radiohead/Kid A/01.flac')).toEqual({ folder: 'Kid A', artist: 'Radiohead', albumName: 'Kid A' })
    expect(feed.parseFolder('Kid A/01.flac')).toEqual({ folder: 'Kid A', albumName: 'Kid A' })
    expect(feed.parseFolder('01.flac')).toEqual({ folder: '01.flac' })
  })
})

describe('watchSoulseekDownload', () => {
  const file = (filename: string, state: string) => ({ filename, state }) as slskd.SlskdTransferFile
  const group = (username: string, files: slskd.SlskdTransferFile[]) =>
    ({ username, directories: [{ directory: 'd', fileCount: files.length, files }] }) as slskd.SlskdTransferGroup

  it('reports once all watched files finish, counting successes', async () => {
    vi.useFakeTimers()
    const report = vi.spyOn(feed.internals, 'report').mockImplementation(() => {})
    const getDownloads = vi.spyOn(slskd, 'getDownloads')
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValueOnce([group('bob', [file('A\\Kid A\\1.flac', 'InProgress'), file('A\\Kid A\\2.flac', 'Completed, Succeeded')])])
      .mockResolvedValue([group('other', []), group('bob', [file('A\\Kid A\\1.flac', 'Completed, Succeeded'), file('A\\Kid A\\2.flac', 'Completed, Succeeded'), file('A\\Kid A\\3.flac', 'Completed, Errored')])])
    feed.watchSoulseekDownload('bob', ['A\\Kid A\\1.flac', 'A\\Kid A\\2.flac', 'A\\Kid A\\3.flac'])
    feed.watchSoulseekDownload('bob', [])
    await vi.advanceTimersByTimeAsync(feed.POLL_MS * 3)
    expect(report).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith({ type: 'soulseek_download', files: 2, folder: 'Kid A', artist: 'A', albumName: 'Kid A' })
    await vi.advanceTimersByTimeAsync(feed.POLL_MS * 2)
    expect(getDownloads).toHaveBeenCalledTimes(3)
  })

  it('skips fully failed downloads and gives up on vanished ones', async () => {
    vi.useFakeTimers()
    const report = vi.spyOn(feed.internals, 'report').mockImplementation(() => {})
    vi.spyOn(slskd, 'getDownloads').mockResolvedValue([group('bob', [file('x/1.flac', 'Completed, Errored')])])
    feed.watchSoulseekDownload('bob', ['x/1.flac'])
    feed.watchSoulseekDownload('carl', ['y/1.flac'])
    await vi.advanceTimersByTimeAsync(feed.POLL_MS * (feed.MAX_MISSES + 1))
    expect(report).not.toHaveBeenCalled()
  })
})

describe('formatRelative', () => {
  const now = new Date('2026-01-10T12:00:00Z').getTime()
  it('formats recent times relatively and older ones as dates', () => {
    expect(feed.formatRelative('2026-01-10T11:59:50Z', now)).toBe('now')
    expect(feed.formatRelative('2026-01-10T11:55:00Z', now)).toBe('5 minutes ago')
    expect(feed.formatRelative('2026-01-10T09:00:00Z', now)).toBe('3 hours ago')
    expect(feed.formatRelative('2026-01-08T12:00:00Z', now)).toBe('2 days ago')
    expect(feed.formatRelative('2025-12-01T12:00:00Z', now)).toBe('Dec 1, 2025')
    useI18nStore.setState({ locale: 'pt-BR' })
    expect(feed.formatRelative('2026-01-10T09:00:00Z', now)).toBe('há 3 horas')
    expect(feed.formatRelative('2026-01-10T09:00:00Z')).not.toBe('')
  })
})
