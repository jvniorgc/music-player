import { Link } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import StarRating from './StarRating'
import type { Review } from '../../services/reviews'
import { formatDate, useT } from '../../i18n'

interface Props {
  review: Review
  isMine?: boolean
  showAlbum?: boolean
  onDelete?: () => void
}

export default function ReviewItem({ review, isMine, showAlbum, onDelete }: Props) {
  const { t } = useT()
  return (
    <li className="py-3 border-b border-border last:border-0">
      <div className="flex items-center gap-3 text-sm">
        <Link to={`/social/user/${review.user.id}`} className="font-medium hover:underline">
          {isMine ? t('reviews.you') : review.user.name}
        </Link>
        <StarRating value={review.rating} size={14} />
        {showAlbum && (
          <Link to={`/album/${review.albumId}`} className="text-accent hover:underline truncate">
            {review.albumName ?? review.albumId}{review.albumArtist ? ` · ${review.albumArtist}` : ''}
          </Link>
        )}
        <span className="ml-auto text-xs text-text-tertiary shrink-0">{formatDate(review.updatedAt)}</span>
        {onDelete && (
          <button onClick={onDelete} className="text-text-tertiary hover:text-red-400" aria-label={t('reviews.delete')} title={t('reviews.delete')}>
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {review.body && <p className="mt-1 text-sm text-text-secondary whitespace-pre-wrap">{review.body}</p>}
    </li>
  )
}
