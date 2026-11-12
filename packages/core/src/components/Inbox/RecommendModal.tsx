import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'
import { listUsers, type KnownUser } from '../../services/social'
import { sendRecommendation, MAX_REC_MESSAGE, type RecItem } from '../../services/friendRecs'
import { jellyfin } from '../../services/jellyfin'
import { useToastStore } from '../../stores/toast'
import { useT } from '../../i18n'

/** Pick friends and an optional note to recommend `item` to. Closed when `item` is null. */
export default function RecommendModal({ item, onClose }: { item: RecItem | null; onClose: () => void }) {
  const { t, tn } = useT()
  const toast = useToastStore(s => s.show)
  const [friends, setFriends] = useState<KnownUser[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!item) return
    setSelected([])
    setMessage('')
    setFriends(null)
    setFailed(false)
    listUsers()
      .then(users => setFriends(users.filter(u => u.id !== jellyfin.userId)))
      .catch(() => setFailed(true))
  }, [item])

  const toggle = (id: string) => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]))

  const send = async () => {
    if (!item) return
    setSending(true)
    try {
      await sendRecommendation(selected, item, message.trim() || undefined)
      toast(tn('inbox.sentToast', selected.length), 'success')
      onClose()
    } catch {
      toast(t('inbox.sendFailed'), 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal open={!!item} title={item ? t('inbox.recommendTitle', { name: item.name }) : ''} onClose={onClose}>
      <p className="text-xs font-medium text-text-tertiary mb-2">{t('inbox.pickFriends')}</p>
      {failed ? (
        <p className="text-sm text-danger">{t('inbox.loadFriendsFailed')}</p>
      ) : !friends ? (
        <Loader2 size={18} className="animate-spin text-text-tertiary" />
      ) : friends.length === 0 ? (
        <p className="text-sm text-text-secondary">{t('inbox.noFriends')}</p>
      ) : (
        <div className="max-h-48 overflow-y-auto space-y-1">
          {friends.map(f => (
            <label key={f.id} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-white/5 text-sm cursor-pointer">
              <input type="checkbox" checked={selected.includes(f.id)} onChange={() => toggle(f.id)} className="accent-accent" />
              {f.name}
            </label>
          ))}
        </div>
      )}
      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        maxLength={MAX_REC_MESSAGE}
        rows={3}
        placeholder={t('inbox.messagePlaceholder')}
        aria-label={t('inbox.messagePlaceholder')}
        className="mt-4 w-full rounded-sm bg-surface-2 border border-border px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent resize-none"
      />
      <p className="text-right text-xs text-text-tertiary">{message.length}/{MAX_REC_MESSAGE}</p>
      <div className="flex justify-end gap-2 mt-3">
        <Button variant="secondary" onClick={onClose}>{t('inbox.cancel')}</Button>
        <Button onClick={send} disabled={selected.length === 0 || sending}>{t('inbox.send')}</Button>
      </div>
    </Modal>
  )
}
