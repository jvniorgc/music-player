import { describe, it, expect, vi, beforeEach } from 'vitest'

const unsubscribeFavorites = vi.hoisted(() => () => {})

vi.mock('../services/jellyfin', () => ({
  jellyfin: {
    getFavoriteSongs: vi.fn(),
    onFavoriteAdded: vi.fn(() => unsubscribeFavorites),
    getDownloadUrl: (id: string) => `download://${id}`,
    getLyricsWithCache: vi.fn().mockResolvedValue([{ Text: 'la' }]),
  },
}))

vi.mock('../services/notifications', () => ({ notifyDownloadComplete: vi.fn() }))

import { notifyDownloadComplete } from '../services/notifications'
import { useDownloadStore, type DownloadItem } from './download'
import { jellyfin } from '../services/jellyfin'
import { useStreamingPrefs } from './prefs/streaming'

const ITEM = { Id: 'it1', Name: 'Song', AlbumArtist: 'Artist', Type: 'Audio' }
const flush = () => new Promise(r => setTimeout(r, 0))

beforeEach(() => {
  useDownloadStore.setState({ downloads: new Map() })
})

describe('startDownload', () => {
  it('marks the item downloading and forwards the request to the host', async () => {
    await useDownloadStore.getState().startDownload(ITEM)
    expect(window.api.startDownload).toHaveBeenCalledWith({
      itemId: 'it1',
      url: 'download://it1',
      filename: 'Artist - Song',
      metadata: JSON.stringify(ITEM),
    })
    expect(useDownloadStore.getState().downloads.get('it1')?.status).toBe('downloading')
  })

  it('falls back to "Unknown" artist in the filename', async () => {
    await useDownloadStore.getState().startDownload({ Id: 'x', Name: 'NoArtist', Type: 'Audio' })
    expect(vi.mocked(window.api.startDownload).mock.calls[0][0].filename).toBe('Unknown - NoArtist')
  })
})

describe('isDownloaded / getDownload', () => {
  it('reports downloaded only when the status is completed', () => {
    const map = new Map([['it1', { itemId: 'it1', filename: 'f', metadata: ITEM, status: 'downloading' as DownloadItem['status'], progress: 0.5 }]])
    useDownloadStore.setState({ downloads: map })
    expect(useDownloadStore.getState().isDownloaded('it1')).toBe(false)
    map.set('it1', { ...map.get('it1')!, status: 'completed' })
    useDownloadStore.setState({ downloads: new Map(map) })
    expect(useDownloadStore.getState().isDownloaded('it1')).toBe(true)
    expect(useDownloadStore.getState().getDownload('it1')?.filename).toBe('f')
  })
})

describe('removeDownload & loadDownloads', () => {
  it('removeDownload calls the host and drops the entry', async () => {
    useDownloadStore.setState({ downloads: new Map([['it1', { itemId: 'it1', filename: 'f', metadata: ITEM, status: 'completed', progress: 1 }]]) })
    await useDownloadStore.getState().removeDownload('it1')
    expect(window.api.removeDownload).toHaveBeenCalledWith('it1')
    expect(useDownloadStore.getState().downloads.has('it1')).toBe(false)
  })

  it('loadDownloads hydrates the map and skips rows with bad metadata', async () => {
    vi.mocked(window.api.listDownloads).mockResolvedValue([
      { item_id: 'ok', filename: 'good', metadata: JSON.stringify(ITEM), status: 'completed' },
      { item_id: 'nometa', filename: 'none', status: 'completed' }, // missing metadata -> defaults to {}
      { item_id: 'bad', filename: 'bad', metadata: '{not json', status: 'completed' },
    ] as never)
    await useDownloadStore.getState().loadDownloads()
    const map = useDownloadStore.getState().downloads
    expect(map.has('ok')).toBe(true)
    expect(map.get('ok')?.progress).toBe(1)
    expect(map.has('nometa')).toBe(true)
    expect(map.has('bad')).toBe(false)
  })
})

describe('initListeners', () => {
  it('wires progress/complete/error events and returns an unsubscribe', async () => {
    useDownloadStore.setState({ downloads: new Map([['it1', { itemId: 'it1', filename: 'f', metadata: ITEM, status: 'downloading', progress: 0 }]]) })
    const unsub = useDownloadStore.getState().initListeners()

    const onProgress = vi.mocked(window.api.onDownloadProgress).mock.calls[0][0]
    const onComplete = vi.mocked(window.api.onDownloadComplete).mock.calls[0][0]
    const onError = vi.mocked(window.api.onDownloadError).mock.calls[0][0]

    onProgress({ itemId: 'it1', progress: 0.4 })
    expect(useDownloadStore.getState().downloads.get('it1')?.progress).toBe(0.4)

    onComplete({ itemId: 'it1' })
    expect(useDownloadStore.getState().downloads.get('it1')?.status).toBe('completed')
    expect(notifyDownloadComplete).toHaveBeenCalledWith(ITEM)
    onComplete({ itemId: 'unknown' })
    expect(notifyDownloadComplete).toHaveBeenCalledTimes(1)
    await flush()
    expect(jellyfin.getLyricsWithCache).toHaveBeenCalledWith('it1')
    expect(window.api.saveDownloadedLyrics).toHaveBeenCalled()

    onError({ itemId: 'it1', error: 'nope' })
    expect(useDownloadStore.getState().downloads.get('it1')?.status).toBe('failed')

    expect(typeof unsub).toBe('function')
    unsub()
  })
})

describe('auto-download liked songs', () => {
  const LIKED = [ITEM, { Id: 'it2', Name: 'Two', Type: 'Audio' }]

  beforeEach(() => {
    useStreamingPrefs.getState().reset()
    vi.mocked(jellyfin.getFavoriteSongs).mockResolvedValue({ Items: LIKED, TotalRecordCount: 2 })
  })

  it('does nothing while the preference is off', async () => {
    await useDownloadStore.getState().autoDownloadLiked(LIKED)
    await useDownloadStore.getState().syncLikedDownloads()
    expect(window.api.startDownload).not.toHaveBeenCalled()
    expect(jellyfin.getFavoriteSongs).not.toHaveBeenCalled()
  })

  it('downloads liked songs that are not downloaded yet, one at a time', async () => {
    useStreamingPrefs.getState().set({ autoDownloadLiked: true })
    useDownloadStore.setState({ downloads: new Map([['it1', { itemId: 'it1', filename: 'f', metadata: ITEM, status: 'completed' as DownloadItem['status'], progress: 1 }]]) })
    await useDownloadStore.getState().syncLikedDownloads()
    expect(vi.mocked(window.api.startDownload).mock.calls.map(c => c[0].itemId)).toEqual(['it2'])
  })

  it('does not queue the same song twice while a run is in progress, and survives failures', async () => {
    useStreamingPrefs.getState().set({ autoDownloadLiked: true })
    vi.mocked(window.api.startDownload).mockRejectedValueOnce(new Error('boom'))
    const a = useDownloadStore.getState().autoDownloadLiked(LIKED)
    useDownloadStore.setState({ downloads: new Map() })
    const b = useDownloadStore.getState().autoDownloadLiked(LIKED)
    await Promise.all([a, b])
    expect(vi.mocked(window.api.startDownload).mock.calls.map(c => c[0].itemId)).toEqual(['it1', 'it2'])
  })

  it('swallows favorite-fetch errors', async () => {
    useStreamingPrefs.getState().set({ autoDownloadLiked: true })
    vi.mocked(jellyfin.getFavoriteSongs).mockRejectedValueOnce(new Error('offline'))
    await expect(useDownloadStore.getState().syncLikedDownloads()).resolves.toBeUndefined()
  })

  it('initAutoDownload syncs now and again whenever a song is liked', async () => {
    useStreamingPrefs.getState().set({ autoDownloadLiked: true })
    const off = useDownloadStore.getState().initAutoDownload()
    await flush()
    expect(jellyfin.getFavoriteSongs).toHaveBeenCalledTimes(1)
    const onLiked = vi.mocked(jellyfin.onFavoriteAdded).mock.calls[0][0]
    onLiked('it9')
    await flush()
    expect(jellyfin.getFavoriteSongs).toHaveBeenCalledTimes(2)
    expect(off).toBe(unsubscribeFavorites)
  })
})
