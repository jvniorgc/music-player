import { useEffect, useState, type ReactNode } from 'react'
import { Music } from 'lucide-react'

export interface CoverArtProps {
  /** Image URL; when empty or failing to load, `fallback` is shown instead. */
  src?: string | null
  alt?: string
  /** Classes for the wrapping box (size, rounding, background). */
  className?: string
  imgClassName?: string
  /** Content rendered when there is no image. Defaults to a muted music icon. */
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
  fallback = <Music size={16} className="text-text-tertiary" />,
  fallbackClassName = 'w-full h-full flex items-center justify-center',
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
        <div className={fallbackClassName}>{fallback}</div>
      )}
      {children}
    </div>
  )
}
