import { usePlayerStore } from '../../stores/player'
import { jellyfin } from '../../services/jellyfin'
import { QueueTrack } from '../../services/playback'
import CoverArt from '../UI/CoverArt'
import { X, Music } from 'lucide-react'
import { formatTicks, artistNames } from '../../lib/format'
import { useShallow } from 'zustand/react/shallow'

function TrackRow({ track, index, onPlay, onRemove }: {
  track: QueueTrack
  index: number
  onPlay: () => void
  onRemove: () => void
}) {
  return (
    <div
      className="flex items-center gap-3 px-2 py-2 rounded-sm hover:bg-white/5 transition-colors group cursor-pointer"
      onClick={onPlay}
    >
      <span className="text-xs text-text-tertiary w-5 text-right tabular-nums group-hover:hidden">{index + 1}</span>
      <CoverArt
        src={track.item.AlbumId ? jellyfin.getImageUrl(track.item.AlbumId, undefined, 80) : null}
        className="w-9 h-9 rounded overflow-hidden bg-surface-2 shrink-0"
        kind="track"
        iconSize={14}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm truncate">{track.item.Name}</p>
        <p className="text-xs text-text-secondary truncate">
          {artistNames(track.item)}
        </p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove() }}
        className="p-1 rounded-full opacity-0 group-hover:opacity-100 hover:bg-white/10 text-text-tertiary transition-all shrink-0"
        title="Remove from queue"
      >
        <X size={14} />
      </button>
      <span className="text-[11px] text-text-tertiary tabular-nums">
        {formatTicks(track.item.RunTimeTicks)}
      </span>
    </div>
  )
}

export default function QueueView() {
  const { currentTrack, userQueue, contextUpNext, contextName, setShowQueue, playUserQueueAt, playContextAt, removeFromUserQueue, removeFromContext } = usePlayerStore(useShallow(s => ({
    currentTrack: s.currentTrack,
    userQueue: s.userQueue,
    contextUpNext: s.contextUpNext,
    contextName: s.contextName,
    setShowQueue: s.setShowQueue,
    playUserQueueAt: s.playUserQueueAt,
    playContextAt: s.playContextAt,
    removeFromUserQueue: s.removeFromUserQueue,
    removeFromContext: s.removeFromContext,
  })))

  const isEmpty = userQueue.length === 0 && contextUpNext.length === 0

  return (
    <div className="w-80 bg-surface-1 border-l border-border flex flex-col h-full">
      <div className="flex items-center justify-between px-5 pt-14 pb-3">
        <h2 className="text-lg font-semibold">Queue</h2>
        <button
          onClick={() => setShowQueue(false)}
          className="p-1.5 rounded-sm hover:bg-white/10 transition-colors text-text-secondary"
        >
          <X size={16} />
        </button>
      </div>

      {/* Now Playing */}
      {currentTrack && (
        <div className="px-4 mb-4">
          <p className="text-xs font-medium text-text-tertiary px-2 mb-2">Now playing</p>
          <div className="flex items-center gap-3 px-2 py-2 rounded-sm bg-white/5">
            <CoverArt
              src={currentTrack.item.AlbumId ? jellyfin.getImageUrl(currentTrack.item.AlbumId, undefined, 80) : null}
              className="w-10 h-10 rounded overflow-hidden bg-surface-2 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{currentTrack.item.Name}</p>
              <p className="text-xs text-text-secondary truncate">
                {artistNames(currentTrack.item)}
              </p>
            </div>
            <span className="text-[11px] text-text-tertiary tabular-nums">
              {formatTicks(currentTrack.item.RunTimeTicks)}
            </span>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {/* Next in queue (manually added) */}
        {userQueue.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium text-text-tertiary px-2 mb-2">
              Next in Queue · {userQueue.length} {userQueue.length === 1 ? 'song' : 'songs'}
            </p>
            <div className="space-y-0.5">
              {userQueue.map((track, i) => (
                <TrackRow
                  key={`uq-${track.id}-${i}`}
                  track={track}
                  index={i}
                  onPlay={() => playUserQueueAt(i)}
                  onRemove={() => removeFromUserQueue(i)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Next from the current context (album/playlist) */}
        {contextUpNext.length > 0 && (
          <div>
            <p className="text-xs font-medium text-text-tertiary px-2 mb-2">
              {contextName ? `Next from: ${contextName}` : 'Next up'}
            </p>
            <div className="space-y-0.5">
              {contextUpNext.map((track, i) => (
                <TrackRow
                  key={`ctx-${track.id}-${i}`}
                  track={track}
                  index={i}
                  onPlay={() => playContextAt(i)}
                  onRemove={() => removeFromContext(i)}
                />
              ))}
            </div>
          </div>
        )}

        {isEmpty && (
          <div className="flex flex-col items-center justify-center py-12 text-text-tertiary">
            <Music size={32} className="mb-3 opacity-50" />
            <p className="text-sm">Empty queue</p>
          </div>
        )}
      </div>
    </div>
  )
}
