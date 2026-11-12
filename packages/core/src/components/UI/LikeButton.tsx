import { useEffect } from 'react'
import { Heart } from 'lucide-react'
import type { JellyfinItem } from '../../services/jellyfin'
import { useLikesStore } from '../../stores/likes'
import { useT } from '../../i18n'

export interface LikeButtonProps {
  item: Pick<JellyfinItem, 'Id' | 'UserData'>
  size?: number
  /** Fetch the liked state from the server when the item has no UserData. */
  fetchState?: boolean
  /** Spotify-style: only visible on row (`group`) hover, or always when liked. */
  revealOnHover?: boolean
  className?: string
}

/** Heart toggle that likes/unlikes a track; state is shared across all buttons for the same id. */
export default function LikeButton({ item, size = 15, fetchState, revealOnHover, className = '' }: LikeButtonProps) {
  const { t } = useT()
  const stored = useLikesStore(s => s.liked[item.Id])
  const liked = stored ?? item.UserData?.IsFavorite ?? false

  useEffect(() => {
    const s = useLikesStore.getState()
    s.seed([item])
    if (fetchState) void s.ensure(item.Id)
  }, [item, fetchState])

  const label = liked ? t('like.unlike') : t('like.like')
  const hidden = revealOnHover && !liked ? ' opacity-0 group-hover:opacity-100 focus-visible:opacity-100' : ''

  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); void useLikesStore.getState().toggle(item.Id) }}
      className={`p-1.5 rounded-full shrink-0 transition-colors hover:bg-white/10 ${liked ? 'text-accent' : 'text-text-tertiary hover:text-text-primary'}${hidden}${className ? ` ${className}` : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={liked}
    >
      <Heart size={size} fill={liked ? 'currentColor' : 'none'} />
    </button>
  )
}
