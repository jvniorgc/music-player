import { useEffect } from 'react'
import { useDownloadStore } from '../../stores/download'
import { usePlayerStore } from '../../stores/player'
import { jellyfin, JellyfinItem } from '../../services/jellyfin'
import { Download, Trash2, Play, Music, HardDrive, Loader2 } from 'lucide-react'

function formatDuration(ticks?: number): string {
  if (!ticks) return ''
  const seconds = Math.floor(ticks / 10_000_000)
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

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
            {completed.length} {completed.length === 1 ? 'música baixada' : 'músicas baixadas'}
          </p>
        </div>
        {completed.length > 0 && (
          <button
            onClick={handlePlayAll}
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-5 py-2 rounded-full text-sm font-semibold transition-colors"
          >
            <Play size={15} fill="white" className="ml-0.5" />
            Reproduzir
          </button>
        )}
      </div>

      {/* In progress */}
      {inProgress.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-text-tertiary uppercase tracking-wider mb-3">Baixando</h3>
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
            const imageUrl = dl.metadata?.AlbumId
              ? jellyfin.getImageUrl(dl.metadata.AlbumId, undefined, 80)
              : null

            return (
              <div
                key={dl.itemId}
                className="flex items-center gap-4 px-5 py-3 hover:bg-white/5 transition-colors cursor-pointer group"
                onClick={() => playItems(completed.map(d => d.metadata), i)}
              >
                <div className="w-10 h-10 rounded overflow-hidden bg-bg-elevated shrink-0 relative">
                  {imageUrl ? (
                    <img src={imageUrl} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music size={16} className="text-text-tertiary" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors">
                    <Play size={14} className="text-white opacity-0 group-hover:opacity-100 ml-0.5" fill="white" />
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{dl.metadata?.Name || dl.filename}</p>
                  <p className="text-xs text-text-secondary truncate">
                    {dl.metadata?.Artists?.join(', ') || dl.metadata?.AlbumArtist || ''}
                    {dl.metadata?.Album ? ` — ${dl.metadata.Album}` : ''}
                  </p>
                </div>

                <span className="text-xs text-text-tertiary tabular-nums shrink-0">
                  {formatDuration(dl.metadata?.RunTimeTicks)}
                </span>

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeDownload(dl.itemId)
                  }}
                  className="p-1.5 rounded-lg text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-400/10 transition-all"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )
          })}
        </div>
      ) : inProgress.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-text-tertiary">
          <HardDrive size={48} className="mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-text-secondary mb-1">Nenhum download</h3>
          <p className="text-sm">Baixe músicas para ouvir offline</p>
        </div>
      ) : null}
    </div>
  )
}
