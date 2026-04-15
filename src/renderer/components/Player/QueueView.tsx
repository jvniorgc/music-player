import { usePlayerStore } from '../../stores/player'
import { jellyfin } from '../../services/jellyfin'
import { X, Music, GripVertical } from 'lucide-react'

function formatDuration(ticks?: number): string {
  if (!ticks) return ''
  const seconds = Math.floor(ticks / 10_000_000)
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function QueueView() {
  const { queue, currentTrack, setShowQueue } = usePlayerStore()
  const currentIndex = queue.findIndex(t => t.id === currentTrack?.id)
  const upNext = queue.slice(currentIndex + 1)

  return (
    <div className="w-80 bg-bg-secondary/80 backdrop-blur-xl border-l border-border-subtle flex flex-col h-full">
      <div className="flex items-center justify-between px-5 pt-14 pb-3">
        <h2 className="text-lg font-bold">A Seguir</h2>
        <button
          onClick={() => setShowQueue(false)}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-text-secondary"
        >
          <X size={16} />
        </button>
      </div>

      {/* Now Playing */}
      {currentTrack && (
        <div className="px-4 mb-4">
          <p className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider px-2 mb-2">Tocando Agora</p>
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-white/5">
            {currentTrack.item.AlbumId ? (
              <img
                src={jellyfin.getImageUrl(currentTrack.item.AlbumId, undefined, 80)}
                className="w-10 h-10 rounded object-cover"
                alt=""
              />
            ) : (
              <div className="w-10 h-10 rounded bg-bg-elevated flex items-center justify-center">
                <Music size={16} className="text-text-tertiary" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{currentTrack.item.Name}</p>
              <p className="text-xs text-text-secondary truncate">
                {currentTrack.item.Artists?.join(', ') || currentTrack.item.AlbumArtist}
              </p>
            </div>
            <span className="text-[11px] text-text-tertiary tabular-nums">
              {formatDuration(currentTrack.item.RunTimeTicks)}
            </span>
          </div>
        </div>
      )}

      {/* Up Next */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {upNext.length > 0 && (
          <>
            <p className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider px-2 mb-2">
              A Seguir · {upNext.length} {upNext.length === 1 ? 'música' : 'músicas'}
            </p>
            <div className="space-y-0.5">
              {upNext.map((track, i) => (
                <div
                  key={`${track.id}-${i}`}
                  className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors group cursor-pointer"
                  onClick={() => usePlayerStore.getState().playItems(
                    queue.map(t => t.item),
                    currentIndex + 1 + i
                  )}
                >
                  <span className="text-xs text-text-tertiary w-5 text-right tabular-nums">{i + 1}</span>
                  {track.item.AlbumId ? (
                    <img
                      src={jellyfin.getImageUrl(track.item.AlbumId, undefined, 80)}
                      className="w-9 h-9 rounded object-cover"
                      alt=""
                    />
                  ) : (
                    <div className="w-9 h-9 rounded bg-bg-elevated flex items-center justify-center">
                      <Music size={14} className="text-text-tertiary" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{track.item.Name}</p>
                    <p className="text-xs text-text-secondary truncate">
                      {track.item.Artists?.join(', ') || track.item.AlbumArtist}
                    </p>
                  </div>
                  <span className="text-[11px] text-text-tertiary tabular-nums">
                    {formatDuration(track.item.RunTimeTicks)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {upNext.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-text-tertiary">
            <Music size={32} className="mb-3 opacity-50" />
            <p className="text-sm">Fila vazia</p>
          </div>
        )}
      </div>
    </div>
  )
}
