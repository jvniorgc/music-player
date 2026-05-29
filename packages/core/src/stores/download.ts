import { create } from 'zustand'
import { JellyfinItem, jellyfin } from '../services/jellyfin'

interface DownloadItem {
  itemId: string
  filename: string
  metadata: JellyfinItem
  status: 'pending' | 'downloading' | 'completed' | 'failed'
  progress: number
}

interface DownloadState {
  downloads: Map<string, DownloadItem>
  isDownloaded: (itemId: string) => boolean
  getDownload: (itemId: string) => DownloadItem | undefined
  startDownload: (item: JellyfinItem) => Promise<void>
  removeDownload: (itemId: string) => Promise<void>
  loadDownloads: () => Promise<void>
  initListeners: () => () => void
}

export const useDownloadStore = create<DownloadState>((set, get) => ({
  downloads: new Map(),

  isDownloaded: (itemId) => {
    const dl = get().downloads.get(itemId)
    return dl?.status === 'completed'
  },

  getDownload: (itemId) => get().downloads.get(itemId),

  startDownload: async (item) => {
    const dl: DownloadItem = {
      itemId: item.Id,
      filename: `${item.AlbumArtist || 'Unknown'} - ${item.Name}`,
      metadata: item,
      status: 'downloading',
      progress: 0
    }

    set(state => {
      const newMap = new Map(state.downloads)
      newMap.set(item.Id, dl)
      return { downloads: newMap }
    })

    await window.api.startDownload({
      itemId: item.Id,
      url: jellyfin.getDownloadUrl(item.Id),
      filename: dl.filename,
      metadata: JSON.stringify(item)
    })
  },

  removeDownload: async (itemId) => {
    await window.api.removeDownload(itemId)
    set(state => {
      const newMap = new Map(state.downloads)
      newMap.delete(itemId)
      return { downloads: newMap }
    })
  },

  loadDownloads: async () => {
    const rows = await window.api.listDownloads() as any[]
    const map = new Map<string, DownloadItem>()
    for (const row of rows) {
      try {
        const metadata = JSON.parse(row.metadata || '{}')
        map.set(row.item_id, {
          itemId: row.item_id,
          filename: row.filename,
          metadata,
          status: row.status,
          progress: 1
        })
      } catch {}
    }
    set({ downloads: map })
  },

  initListeners: () => {
    const unsubs: (() => void)[] = []

    unsubs.push(window.api.onDownloadProgress(({ itemId, progress }) => {
      set(state => {
        const newMap = new Map(state.downloads)
        const dl = newMap.get(itemId)
        if (dl) {
          newMap.set(itemId, { ...dl, progress, status: 'downloading' })
        }
        return { downloads: newMap }
      })
    }))

    unsubs.push(window.api.onDownloadComplete(({ itemId }) => {
      set(state => {
        const newMap = new Map(state.downloads)
        const dl = newMap.get(itemId)
        if (dl) {
          newMap.set(itemId, { ...dl, progress: 1, status: 'completed' })
        }
        return { downloads: newMap }
      })

      // Fetch and persist lyrics for offline use
      jellyfin.getLyricsWithCache(itemId).then(lines => {
        window.api.saveDownloadedLyrics(itemId, JSON.stringify(lines)).catch(() => {})
      }).catch(() => {})
    }))

    unsubs.push(window.api.onDownloadError(({ itemId }) => {
      set(state => {
        const newMap = new Map(state.downloads)
        const dl = newMap.get(itemId)
        if (dl) {
          newMap.set(itemId, { ...dl, status: 'failed' })
        }
        return { downloads: newMap }
      })
    }))

    return () => unsubs.forEach(u => u())
  }
}))
