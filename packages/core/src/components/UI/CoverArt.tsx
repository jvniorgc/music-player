import { useEffect, useState, type ReactNode } from 'react'
import { Disc3, ListMusic, Music, User, type LucideIcon } from 'lucide-react'

export type CoverKind = 'track' | 'album' | 'artist' | 'playlist'

const KIND_ICONS: Record<CoverKind, LucideIcon> = { track: Music, album: Disc3, artist: User, playlist: ListMusic }

/** Neutral placeholder icon used whenever artwork is missing. */
export function CoverFallbackIcon({ kind = 'track', size = 16 }: { kind?: CoverKind; size?: number }) {
  const Icon = KIND_ICONS[kind]
  return <Icon size={size} strokeWidth={1.5} className="text-text-tertiary" aria-hidden="true" />
}

export interface CoverArtProps {
  /** Image URL; when empty or failing to load, `fallback` is shown instead. */
  src?: string | null
  alt?: string
  /** Classes for the wrapping box (size, rounding, background). */
  className?: string
  imgClassName?: string
  /** Which placeholder icon to show when there is no image. */
  kind?: CoverKind
  /** Size of the placeholder icon. */
  iconSize?: number
  /** Custom placeholder content; overrides `kind`. */
  fallback?: ReactNode
  fallbackClassName?: string
  /** Use `eager` for above-the-fold hero images. */
  loading?: 'lazy' | 'eager'
  /** Overlays rendered on top of the image (e.g. hover play button). */
  children?: ReactNode
}

export default function CoverArt({
  src,
  alt = '',
  className = '',
  imgClassName = 'w-full h-full object-cover',
  kind = 'track',
  iconSize = 16,
  fallback,
  fallbackClassName = 'w-full h-full flex items-center justify-center bg-surface-2',
  loading = 'lazy',
  children,
}: CoverArtProps) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])

  return (
    <div className={className}>
      {src && !failed ? (
        <img
          src={src}
          className={imgClassName}
          alt={alt}
          loading={loading}
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className={fallbackClassName}>{fallback ?? <CoverFallbackIcon kind={kind} size={iconSize} />}</div>
      )}
      {children}
    </div>
  )
}
