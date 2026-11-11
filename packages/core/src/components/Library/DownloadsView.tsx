import { useEffect } from 'react'
import { useDownloadStore } from '../../stores/download'
import { usePlayerStore } from '../../stores/player'
import { jellyfin } from '../../services/jellyfin'
import { Trash2, Play, HardDrive, Loader2 } from 'lucide-react'
import { artistNames } from '../../lib/format'
import TrackRow, { TrackDuration, CoverPlayOverlay } from '../UI/TrackRow'
import CoverArt from '../UI/CoverArt'

export default function DownloadsView() {
  const { downloads, loadDownloads, removeDownload, initListeners } = useDownloadStore()
  const { playItems } = usePlayerStore()

  useEffect(() => {
    loadDownloads()
    const cleanup = initListeners()
    return cleanup
  }, [])

  const downloadList = Array.from(downloads.values())
  const completed = downloadList.filter(d => d.status === 'completed')
  const inProgress = downloadList.filter(d => d.status === 'downloading')

  const handlePlayAll = () => {
    const items = completed.map(d => d.metadata).filter(Boolean)
    if (items.length > 0) playItems(items)
  }

  return (
    <div className="fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Downloads</h1>
          <p className="text-sm text-text-secondary mt-1">
            {completed.length} {completed.length === 1 ? 'downloaded song' : 'downloaded songs'}
          </p>
        </div>
        {completed.length > 0 && (
          <button
            onClick={handlePlayAll}
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-5 py-2 rounded-full text-sm font-semibold transition-colors"
          >
            <Play size={15} fill="white" className="ml-0.5" />
            Play
          </button>
        )}
      </div>

      {/* In progress */}
      {inProgress.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-text-tertiary uppercase tracking-wider mb-3">Downloading</h3>
          <div className="bg-bg-secondary/40 rounded-xl overflow-hidden space-y-0.5">
            {inProgress.map(dl => (
              <div key={dl.itemId} className="flex items-center gap-4 px-5 py-3">
                <Loader2 size={18} className="animate-spin text-accent shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{dl.filename}</p>
                  <div className="mt-1.5 h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-[width] duration-300"
                      style={{ width: `${Math.round(dl.progress * 100)}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs text-text-tertiary tabular-nums shrink-0">
                  {Math.round(dl.progress * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed */}
      {completed.length > 0 ? (
        <div className="bg-bg-secondary/40 rounded-xl overflow-hidden">
          {completed.map((dl, i) => {
            return (
              <TrackRow
                key={dl.itemId}
                onClick={() => playItems(completed.map(d => d.metadata), i)}
                leading={
                  <CoverArt
                    src={dl.metadata?.AlbumId ? jellyfin.getImageUrl(dl.metadata.AlbumId, undefined, 80) : null}
                    className="w-10 h-10 rounded overflow-hidden bg-bg-elevated shrink-0 relative"
                  >
                    <CoverPlayOverlay />
                  </CoverArt>
                }
                title={dl.metadata?.Name || dl.filename}
                subtitle={<>{artistNames(dl.metadata)}{dl.metadata?.Album ? ` — ${dl.metadata.Album}` : ''}</>}
              >
                <TrackDuration ticks={dl.metadata?.RunTimeTicks} />

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeDownload(dl.itemId)
                  }}
                  className="p-1.5 rounded-lg text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-400/10 transition-all"
                >
                  <Trash2 size={14} />
                </button>
              </TrackRow>
            )
          })}
        </div>
      ) : inProgress.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-text-tertiary">
          <HardDrive size={48} className="mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-text-secondary mb-1">No downloads</h3>
          <p className="text-sm">Download songs to listen offline</p>
        </div>
      ) : null}
    </div>
  )
}
