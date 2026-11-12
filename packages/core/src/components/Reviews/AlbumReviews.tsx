import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Star } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import type { JellyfinItem } from '../../services/jellyfin'
import { getMe, type Me } from '../../services/social'
import { formatAverage } from '../../services/reviews'
import { useReviewsStore } from '../../stores/reviews'
import { useToastStore } from '../../stores/toast'
import { buttonClass } from '../UI/Button'
import { useT } from '../../i18n'
import StarRating from './StarRating'
import ReviewItem from './ReviewItem'
import ReviewModal from './ReviewModal'
import { useSocialReady } from './useSocialReady'

/** Group average + count for the album header; renders nothing until there's data. */
export function AlbumRatingSummary({ albumId }: { albumId: string }) {
  const { t, tn } = useT()
  const data = useReviewsStore(s => s.byAlbum[albumId])
  if (!data?.count || data.average === null) return null
  return (
    <a href="#reviews" className="mt-2 inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary" title={t('reviews.average', { avg: formatAverage(data.average) })}>
      <StarRating value={Math.round(data.average)} size={14} />
      <span className="font-medium text-text-primary">{formatAverage(data.average)}</span>
      <span>· {tn('reviews.count', data.count)}</span>
    </a>
  )
}

export default function AlbumReviews({ album }: { album: JellyfinItem }) {
  const { t, tn } = useT()
  const ready = useSocialReady()
  const toast = useToastStore(s => s.show)
  const { data, load, save, remove } = useReviewsStore(useShallow(s => ({ data: s.byAlbum[album.Id], load: s.load, save: s.save, remove: s.remove })))
  const [me, setMe] = useState<Me | null>(null)
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!ready) return
    setFailed(false)
    load(album.Id).catch(() => setFailed(true))
    getMe().then(setMe).catch(() => {})
  }, [ready, album.Id, load])

  if (!ready || failed || !data) return null

  const run = async (fn: () => Promise<void>, ok: 'reviews.saved' | 'reviews.deleted') => {
    try {
      await fn()
      setEditing(false)
      toast(t(ok), 'success')
    } catch {
      toast(t('reviews.error'), 'error')
    }
  }

  const others = data.items.filter(r => r.user.id !== data.mine?.user.id)

  return (
    <section id="reviews" className="mt-10">
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-lg font-semibold">{t('reviews.section')}</h2>
        {data.average !== null && (
          <span className="text-sm text-text-secondary">{formatAverage(data.average)} · {tn('reviews.count', data.count)}</span>
        )}
        <Link to="/reviews" className="ml-auto text-sm text-text-secondary hover:text-text-primary hover:underline">{t('reviews.seeAll')}</Link>
        <button className={buttonClass('secondary')} onClick={() => setEditing(true)}>
          {data.mine ? <Pencil size={14} /> : <Star size={14} />}
          {t(data.mine ? 'reviews.edit' : 'reviews.write')}
        </button>
      </div>
      {data.items.length === 0 ? (
        <p className="text-sm text-text-tertiary">{t('reviews.empty')}</p>
      ) : (
        <ul>
          {data.mine && <ReviewItem review={data.mine} isMine />}
          {others.map(r => (
            <ReviewItem
              key={r.user.id}
              review={r}
              onDelete={me?.isAdmin ? () => run(() => remove(album.Id, r.user.id), 'reviews.deleted') : undefined}
            />
          ))}
        </ul>
      )}
      <ReviewModal
        open={editing}
        existing={data.mine}
        onClose={() => setEditing(false)}
        onSave={(rating, body) => run(() => save(album.Id, { rating, body, albumName: album.Name, albumArtist: album.AlbumArtist }), 'reviews.saved')}
        onDelete={() => run(() => remove(album.Id), 'reviews.deleted')}
      />
    </section>
  )
}
