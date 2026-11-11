import type { MouseEvent, ReactNode } from 'react'
import { Play } from 'lucide-react'
import CoverArt, { type CoverKind } from './CoverArt'
import { jellyfin, type JellyfinItem } from '../../services/jellyfin'
import { usePlayerStore } from '../../stores/player'
import { ArtistLinks } from './Links'
import AlbumMenu from './AlbumMenu'
import { useT } from '../../i18n'

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
  /** "..." menu shown on the cover; right-click on the card opens it too. */
  menu?: ReactNode
}

/** Grid card with square/round cover art, hover dimming and optional play button. */
export default function MediaCard({
  imageUrl, kind = 'album', fallback, fallbackClassName = CARD_FALLBACK_CLASS, shape = 'square',
  title, subtitle, caption, onClick, onContextMenu, onPlay, menu,
}: MediaCardProps) {
  const { t } = useT()
  const circle = shape === 'circle'
  return (
    <div
      data-menu-row={menu ? '' : undefined}
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
        {menu && <div className="absolute top-2 right-2" onClick={e => e.stopPropagation()}>{menu}</div>}
        {onPlay && (
          <button
            onClick={(e) => { e.stopPropagation(); onPlay(e) }}
            aria-label={t('common.play')}
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

export async function playAlbum(album: Pick<JellyfinItem, 'Id' | 'Name'>, opts: { shuffle?: boolean } = {}): Promise<void> {
  try {
    const res = await jellyfin.getAlbumItems(album.Id)
    const ctx = { type: 'album' as const, id: album.Id, name: album.Name }
    if (res.Items.length === 0) return
    if (opts.shuffle) usePlayerStore.getState().shuffleItems(res.Items, ctx)
    else usePlayerStore.getState().playItems(res.Items, 0, ctx)
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
      onPlay={() => playAlbum(item)}
      menu={<AlbumMenu album={item} />}
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
