import { useEffect, useState } from 'react'
import { userReviews, type Review } from '../../services/reviews'
import { useT } from '../../i18n'
import ReviewItem from './ReviewItem'
import { useSocialReady } from './useSocialReady'

/** "Reviews by <user>" on profiles; hidden when the social server is off or there are none. */
export default function UserReviews({ userId, name }: { userId: string; name: string }) {
  const { t } = useT()
  const ready = useSocialReady()
  const [items, setItems] = useState<Review[]>([])

  useEffect(() => {
    if (!ready) return
    userReviews(userId).then(setItems).catch(() => setItems([]))
  }, [ready, userId])

  if (!items.length) return null
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold mb-2">{t('reviews.byUser', { name })}</h2>
      <ul>{items.slice(0, 20).map(r => <ReviewItem key={r.albumId} review={r} showAlbum />)}</ul>
    </section>
  )
}
