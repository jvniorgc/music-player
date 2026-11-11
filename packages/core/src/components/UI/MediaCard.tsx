import type { MouseEvent, ReactNode } from 'react'
import { Play } from 'lucide-react'
import CoverArt, { type CoverKind } from './CoverArt'
import { jellyfin, type JellyfinItem } from '../../services/jellyfin'
import { usePlayerStore } from '../../stores/player'
import { ArtistLinks } from './Links'

export const CARD_FALLBACK_CLASS =
  'w-full h-full flex items-center justify-center bg-surface-2'

export interface MediaCardProps {
  imageUrl?: string | null
  /** Placeholder icon kind when the image is missing. */
  kind?: CoverKind
  /** Custom placeholder content; overrides `kind`. */
  fallback?: ReactNode
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
  imageUrl, kind = 'album', fallback, fallbackClassName = CARD_FALLBACK_CLASS, shape = 'square',
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
        className={`relative aspect-square ${circle ? 'rounded-full mx-auto' : 'rounded-md'} overflow-hidden bg-surface-2 mb-2`}
        kind={kind}
        iconSize={40}
        fallback={fallback}
        fallbackClassName={fallbackClassName}
      >
        <div className={`absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors${circle ? ' rounded-full' : ''}`} />
        {onPlay && (
          <button
            onClick={(e) => { e.stopPropagation(); onPlay(e) }}
            aria-label="Play"
            className="absolute bottom-2 right-2 w-9 h-9 bg-accent hover:bg-accent-hover rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity shadow-md"
          >
            <Play size={16} className="text-white ml-0.5" fill="white" />
          </button>
        )}
      </CoverArt>
      {caption ?? (
        <>
          <p className="text-sm font-medium text-text-primary truncate">{title}</p>
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

export function AlbumCard({ item, onClick, subtitle, fallback }: {
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
          <ArtistLinks item={item.AlbumArtists?.length ? { AlbumArtists: item.AlbumArtists } : item} />
          {item.ProductionYear ? ` · ${item.ProductionYear}` : ''}
        </>
      )}
      onClick={onClick}
      onPlay={() => playAlbum(item.Id)}
    />
  )
}

export function ArtistCard({ item, onClick, subtitle, fallback }: {
  item: JellyfinItem
  onClick: () => void
  subtitle?: ReactNode
  fallback?: ReactNode
}) {
  return (
    <MediaCard
      shape="circle"
      kind="artist"
      imageUrl={item.ImageTags?.Primary ? jellyfin.getImageUrl(item.Id, item.ImageTags.Primary) : null}
      fallback={fallback}
      title={item.Name}
      subtitle={subtitle}
      onClick={onClick}
    />
  )
}
