import type { MouseEvent, ReactNode } from 'react'
import { Play } from 'lucide-react'
import CoverArt from './CoverArt'
import { jellyfin, type JellyfinItem } from '../../services/jellyfin'
import { usePlayerStore } from '../../stores/player'

export const CARD_FALLBACK_CLASS =
  'w-full h-full flex items-center justify-center bg-gradient-to-br from-bg-elevated to-bg-tertiary'

export interface MediaCardProps {
  imageUrl?: string | null
  /** Content shown in place of the image when missing. */
  fallback: ReactNode
  fallbackClassName?: string
  shape?: 'square' | 'circle'
  title: ReactNode
  subtitle?: ReactNode
  /** Replaces the default title/subtitle caption entirely. */
  caption?: ReactNode
  onClick?: () => void
  onContextMenu?: (e: MouseEvent) => void
  /** When set, a hover play button is shown on the cover. */
  onPlay?: (e: MouseEvent) => void
}

/** Grid card with square/round cover art, hover dimming and optional play button. */
export default function MediaCard({
  imageUrl, fallback, fallbackClassName = CARD_FALLBACK_CLASS, shape = 'square',
  title, subtitle, caption, onClick, onContextMenu, onPlay,
}: MediaCardProps) {
  const circle = shape === 'circle'
  return (
    <div
      className={`group cursor-pointer${circle ? ' text-center' : ''}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <CoverArt
        src={imageUrl}
        className={`relative aspect-square ${circle ? 'rounded-full mx-auto' : 'rounded-xl'} overflow-hidden bg-bg-elevated mb-3 shadow-lg shadow-black/20`}
        fallback={fallback}
        fallbackClassName={fallbackClassName}
      >
        <div className={`absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors${circle ? ' rounded-full' : ''}`} />
        {onPlay && (
          <button
            onClick={(e) => { e.stopPropagation(); onPlay(e) }}
            className="absolute bottom-3 right-3 w-10 h-10 bg-accent rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 transform translate-y-1 group-hover:translate-y-0 shadow-lg shadow-black/30"
          >
            <Play size={18} className="text-white ml-0.5" fill="white" />
          </button>
        )}
      </CoverArt>
      {caption ?? (
        <>
          <p className="text-sm font-medium truncate">{title}</p>
          {subtitle != null && <p className="text-xs text-text-secondary truncate">{subtitle}</p>}
        </>
      )}
    </div>
  )
}

export async function playAlbum(albumId: string): Promise<void> {
  try {
    const res = await jellyfin.getAlbumItems(albumId)
    if (res.Items.length > 0) usePlayerStore.getState().playItems(res.Items)
  } catch (err) {
    console.error('Failed to play album:', err)
  }
}

export function AlbumCard({ item, onClick, subtitle, fallback = <span className="text-4xl">💿</span> }: {
  item: JellyfinItem
  onClick: () => void
  /** Defaults to "Album artist · Year". */
  subtitle?: ReactNode
  fallback?: ReactNode
}) {
  return (
    <MediaCard
      imageUrl={item.ImageTags?.Primary ? jellyfin.getImageUrl(item.Id, item.ImageTags.Primary) : null}
      fallback={fallback}
      title={item.Name}
      subtitle={subtitle ?? (
        <>
          {item.AlbumArtist || item.ArtistItems?.[0]?.Name || ''}
          {item.ProductionYear ? ` · ${item.ProductionYear}` : ''}
        </>
      )}
      onClick={onClick}
      onPlay={() => playAlbum(item.Id)}
    />
  )
}

export function ArtistCard({ item, onClick, subtitle, fallback = <span className="text-4xl">🎤</span> }: {
  item: JellyfinItem
  onClick: () => void
  subtitle?: ReactNode
  fallback?: ReactNode
}) {
  return (
    <MediaCard
      shape="circle"
      imageUrl={item.ImageTags?.Primary ? jellyfin.getImageUrl(item.Id, item.ImageTags.Primary) : null}
      fallback={fallback}
      title={item.Name}
      subtitle={subtitle}
      onClick={onClick}
    />
  )
}
