import { useState, useEffect, useRef } from 'react'
import { MoreHorizontal, ListEnd, ListStart, ListPlus } from 'lucide-react'
import { JellyfinItem } from '../../services/jellyfin'
import { usePlayerStore } from '../../stores/player'
import { useToastStore } from '../../stores/toast'

interface TrackMenuProps {
  track: JellyfinItem
  extraItems?: React.ReactNode
  onPlaylistAdd?: (track: JellyfinItem) => void
}

export default function TrackMenu({ track, extraItems, onPlaylistAdd }: TrackMenuProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const { addToQueue, addNext } = usePlayerStore()
  const toast = useToastStore(s => s.show)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [open])

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) {
      const x = Math.min(rect.left, window.innerWidth - 200)
      const y = rect.bottom + 4
      setPosition({ x, y: y + 160 > window.innerHeight ? rect.top - 160 : y })
    }
    setOpen(true)
  }

  const handleAddToQueue = () => {
    addToQueue(track)
    toast('Added to queue', 'success')
    setOpen(false)
  }

  const handlePlayNext = () => {
    addNext(track)
    toast('Will play next', 'success')
    setOpen(false)
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleOpen}
        className="p-1.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-white/10 text-text-tertiary transition-all shrink-0"
        title="More options"
      >
        <MoreHorizontal size={14} />
      </button>

      {open && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-bg-elevated border border-border rounded-xl shadow-2xl py-1.5 min-w-[180px]"
          style={{ left: position.x, top: position.y }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={handlePlayNext}
            className="flex items-center gap-3 w-full px-4 py-2 text-sm text-text-primary hover:bg-white/10 transition-colors"
          >
            <ListStart size={14} />
            Play Next
          </button>
          <button
            onClick={handleAddToQueue}
            className="flex items-center gap-3 w-full px-4 py-2 text-sm text-text-primary hover:bg-white/10 transition-colors"
          >
            <ListEnd size={14} />
            Add to Queue
          </button>
          {onPlaylistAdd && (
            <button
              onClick={() => { setOpen(false); onPlaylistAdd(track) }}
              className="flex items-center gap-3 w-full px-4 py-2 text-sm text-text-primary hover:bg-white/10 transition-colors"
            >
              <ListPlus size={14} />
              Add to Playlist
            </button>
          )}
          {extraItems}
        </div>
      )}
    </>
  )
}
