import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Settings, Star } from 'lucide-react'
import { recentReviews, topRated, formatAverage, type Review, type TopAlbum } from '../../services/reviews'
import { jellyfin } from '../../services/jellyfin'
import { buttonClass } from '../UI/Button'
import { useT } from '../../i18n'
import StarRating from './StarRating'
import ReviewItem from './ReviewItem'
import { useSocialReady } from './useSocialReady'

type Tab = 'recent' | 'top'

export default function ReviewsView() {
  const { t, tn } = useT()
  const ready = useSocialReady()
  const [tab, setTab] = useState<Tab>('recent')
  const [recent, setRecent] = useState<Review[] | null>(null)
  const [top, setTop] = useState<TopAlbum[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!ready) return
    setError(false)
    const req = tab === 'recent' ? recentReviews().then(setRecent) : topRated().then(setTop)
    req.catch(() => setError(true))
  }, [ready, tab])

  if (ready === null) {
    return <div className="py-16 flex justify-center"><Loader2 size={24} className="animate-spin text-text-tertiary" /></div>
  }

  if (!ready) {
    return (
      <div className="fade-in flex flex-col items-center justify-center py-24 text-text-tertiary gap-4">
        <Star size={48} strokeWidth={1} />
        <p>{t('reviews.notConfigured')}</p>
        <Link to="/settings#social-server" className={buttonClass('secondary')}>
          <Settings size={14} /> {t('reviews.openSettings')}
        </Link>
      </div>
    )
  }

  const list = tab === 'recent' ? recent : top

  return (
    <div className="fade-in pb-8">
      <h1 className="text-title font-semibold">{t('reviews.title')}</h1>
      <p className="text-sm text-text-secondary mt-1 mb-6">{t('reviews.subtitle')}</p>
      <div role="tablist" className="flex gap-2 mb-4">
        {(['recent', 'top'] as const).map(k => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-full text-sm transition-colors ${tab === k ? 'bg-accent text-white' : 'bg-surface-2 text-text-secondary hover:text-text-primary'}`}
          >
            {t(k === 'recent' ? 'reviews.recent' : 'reviews.top')}
          </button>
        ))}
      </div>
      {error ? (
        <p className="text-sm text-red-400">{t('reviews.error')}</p>
      ) : !list ? (
        <Loader2 size={20} className="animate-spin text-text-tertiary" />
      ) : list.length === 0 ? (
        <p className="text-sm text-text-tertiary">{t(tab === 'recent' ? 'reviews.empty' : 'reviews.emptyTop')}</p>
      ) : tab === 'recent' ? (
        <ul>{(list as Review[]).map(r => <ReviewItem key={`${r.albumId}:${r.user.id}`} review={r} showAlbum />)}</ul>
      ) : (
        <ol className="flex flex-col gap-2">
          {(list as TopAlbum[]).map((a, i) => (
            <li key={a.albumId}>
              <Link to={`/album/${a.albumId}`} className="flex items-center gap-3 p-2 rounded-md hover:bg-white/5">
                <span className="w-6 text-right text-text-tertiary">{i + 1}</span>
                <img src={jellyfin.getImageUrl(a.albumId, undefined, 96)} alt="" className="w-12 h-12 rounded object-cover bg-surface-2" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{a.albumName ?? a.albumId}</span>
                  <span className="block truncate text-sm text-text-secondary">{a.albumArtist}</span>
                </span>
                <StarRating value={Math.round(a.average)} size={14} />
                <span className="text-sm font-medium">{formatAverage(a.average)}</span>
                <span className="text-xs text-text-tertiary">{tn('reviews.count', a.count)}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
