import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'
import StarRating from './StarRating'
import { MAX_REVIEW_BODY, type Review } from '../../services/reviews'
import { useT } from '../../i18n'

interface Props {
  open: boolean
  existing: Review | null
  onClose: () => void
  onSave: (rating: number, body: string) => Promise<void>
  onDelete: () => Promise<void>
}

export default function ReviewModal({ open, existing, onClose, onSave, onDelete }: Props) {
  const { t } = useT()
  const [rating, setRating] = useState(0)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setRating(existing?.rating ?? 0)
    setBody(existing?.body ?? '')
  }, [open, existing])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn() } finally { setBusy(false) }
  }

  return (
    <Modal open={open} title={t(existing ? 'reviews.edit' : 'reviews.write')} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={e => { e.preventDefault(); if (rating) run(() => onSave(rating, body)) }}
      >
        <StarRating value={rating} onChange={setRating} size={28} />
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          maxLength={MAX_REVIEW_BODY}
          rows={5}
          placeholder={t('reviews.bodyPlaceholder')}
          aria-label={t('reviews.bodyPlaceholder')}
          className="w-full rounded-md bg-surface-2 border border-border px-3 py-2 text-sm resize-none focus:outline-none focus:border-accent"
        />
        <div className="flex items-center justify-between gap-2">
          {existing ? (
            <Button type="button" variant="danger" disabled={busy} onClick={() => run(onDelete)}>
              <Trash2 size={14} /> {t('reviews.delete')}
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>{t('reviews.cancel')}</Button>
            <Button type="submit" disabled={!rating || busy}>{t('reviews.save')}</Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
