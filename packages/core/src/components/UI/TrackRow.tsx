import type { ReactNode } from 'react'
import { Play } from 'lucide-react'
import { formatTicks } from '../../lib/format'
import { useT } from '../../i18n'

/** Animated equalizer bars shown for the currently playing track. */
export function PlayingBars() {
  const { t } = useT()
  return (
    <div className="flex items-end justify-end gap-[2px] h-3" aria-label={t('player.playing')}>
      <div className="eq-bar w-[3px] h-3 bg-accent rounded-[1px]" />
      <div className="eq-bar w-[3px] h-3 bg-accent rounded-[1px]" style={{ animationDelay: '-0.4s' }} />
      <div className="eq-bar w-[3px] h-3 bg-accent rounded-[1px]" style={{ animationDelay: '-0.7s' }} />
    </div>
  )
}

/** Track number cell: number, play icon on row hover, or equalizer bars while playing. */
export function TrackIndex({ number, isCurrent, isPlaying, className = 'w-8' }: {
  number: number
  isCurrent: boolean
  isPlaying: boolean
  className?: string
}) {
  return (
    <div className={`${className} text-right relative`}>
      {isCurrent && isPlaying ? (
        <PlayingBars />
      ) : (
        <>
          <span className={`text-sm tabular-nums ${isCurrent ? 'text-accent' : 'text-text-tertiary group-hover:invisible'}`}>
            {number}
          </span>
          <Play size={14} className="text-white invisible group-hover:visible absolute right-0 top-1/2 -translate-y-1/2" fill="white" />
        </>
      )}
    </div>
  )
}

/** Dimming + play icon overlay for a small cover inside a `group` row. */
export function CoverPlayOverlay() {
  return (
    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors">
      <Play size={14} className="text-white opacity-0 group-hover:opacity-100 ml-0.5" fill="white" />
    </div>
  )
}

export function TrackDuration({ ticks, className = '' }: { ticks?: number; className?: string }) {
  return (
    <span className={`text-xs text-text-tertiary tabular-nums shrink-0${className ? ` ${className}` : ''}`}>
      {formatTicks(ticks)}
    </span>
  )
}

export interface TrackRowProps {
  title: ReactNode
  subtitle?: ReactNode
  isCurrent?: boolean
  onClick?: () => void
  /** Padding / shape classes. */
  className?: string
  /** Cells before the title (index, cover art). */
  leading?: ReactNode
  /** Cells after the title (album, duration, actions). */
  children?: ReactNode
}

/** A clickable song row used by all track lists. */
export default function TrackRow({
  title, subtitle, isCurrent = false, onClick, className = 'px-4 py-2 rounded-sm', leading, children,
}: TrackRowProps) {
  return (
    <div
      data-menu-row
      data-track-row
      className={`flex items-center gap-4 ${className} hover:bg-white/[0.06] transition-colors cursor-pointer group${isCurrent ? ' bg-white/[0.04]' : ''}`}
      onClick={onClick}
    >
      {leading}
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium truncate${isCurrent ? ' text-accent' : ''}`}>{title}</p>
        {subtitle != null && subtitle !== false && <p className="text-xs text-text-secondary truncate">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}
