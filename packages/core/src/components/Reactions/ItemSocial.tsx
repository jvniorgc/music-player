import { useEffect, useState, type FormEvent } from 'react'
import { MessageCircle, Trash2 } from 'lucide-react'
import { useT } from '../../i18n'
import { jellyfin } from '../../services/jellyfin'
import { isConfigured, loadConfig, autoDetect, getMe, type Me } from '../../services/social'
import {
  REACTION_EMOJIS, MAX_COMMENT_LENGTH, getSocial, setReaction, addComment, deleteComment, getSummary,
  type ItemSocial, type ItemSummary, type ReactionItemType,
} from '../../services/reactions'
import { formatTime } from '../../lib/format'
import { useToastStore } from '../../stores/toast'

/** Whether the social server is configured (null while checking). */
export function useSocialReady(): boolean | null {
  const [ready, setReady] = useState<boolean | null>(null)
  useEffect(() => {
    let alive = true
    loadConfig().then(() => autoDetect(jellyfin.serverUrl)).then(() => { if (alive) setReady(isConfigured()) })
    return () => { alive = false }
  }, [])
  return ready
}

interface PanelProps {
  itemId: string
  itemType: ReactionItemType
  /** Current playback position (seconds); enables timestamped comments. */
  getPosition?: () => number
  onSeek?: (seconds: number) => void
}

export function ItemSocialPanel({ itemId, itemType, getPosition, onSeek }: PanelProps) {
  const { t } = useT()
  const [data, setData] = useState<ItemSocial | null>(null)
  const [failed, setFailed] = useState(false)
  const [me, setMe] = useState<Me | null>(null)
  const [body, setBody] = useState('')
  const [atTime, setAtTime] = useState(false)
  const [busy, setBusy] = useState(false)
  const toastError = () => useToastStore.getState().show(t('reactions.actionFailed'), 'error')

  useEffect(() => {
    let alive = true
    setData(null)
    setFailed(false)
    getSocial(itemId).then(d => { if (alive) setData(d) }).catch(() => { if (alive) setFailed(true) })
    getMe().then(m => { if (alive) setMe(m) }).catch(() => {})
    return () => { alive = false }
  }, [itemId])

  if (failed) return <p className="text-sm text-text-tertiary">{t('reactions.loadFailed')}</p>
  if (!data) return null

  const toggle = (emoji: string) => {
    const mine = data.reactions.some(r => r.emoji === emoji && r.mine)
    setReaction(itemId, itemType, emoji, !mine).then(setData).catch(toastError)
  }

  const position = getPosition ? Math.floor(getPosition()) : 0

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const text = body.trim()
    setBusy(true)
    try {
      const c = await addComment(itemId, itemType, text, getPosition && atTime ? position : undefined)
      setData(d => d && { ...d, comments: [...d.comments, c] })
      setBody('')
    } catch {
      toastError()
    } finally {
      setBusy(false)
    }
  }

  const remove = (id: number) => {
    deleteComment(id)
      .then(() => setData(d => d && { ...d, comments: d.comments.filter(c => c.id !== id) }))
      .catch(toastError)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {REACTION_EMOJIS.map(emoji => {
          const r = data.reactions.find(x => x.emoji === emoji)
          return (
            <button
              key={emoji}
              onClick={() => toggle(emoji)}
              aria-label={t('reactions.react', { emoji })}
              aria-pressed={!!r?.mine}
              title={r?.users.join(', ')}
              className={`inline-flex items-center gap-1 px-2 h-7 rounded-full text-sm border transition-colors ${
                r?.mine ? 'border-accent bg-accent/15' : 'border-border hover:bg-white/10'
              }`}
            >
              <span>{emoji}</span>
              {r && <span className="text-xs text-text-secondary">{r.count}</span>}
            </button>
          )
        })}
      </div>

      {data.comments.length === 0 ? (
        <p className="text-sm text-text-tertiary">{t('reactions.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2 max-h-64 overflow-y-auto">
          {data.comments.map(c => (
            <li key={c.id} className="group flex items-start gap-2 text-sm">
              <span className="font-medium shrink-0">{c.user.name}</span>
              {c.positionSeconds !== null && (
                <button
                  onClick={() => onSeek?.(c.positionSeconds!)}
                  className="text-xs text-accent tabular-nums shrink-0 mt-0.5 hover:underline"
                >
                  {formatTime(c.positionSeconds)}
                </button>
              )}
              <span className="text-text-secondary break-words min-w-0 flex-1">{c.body}</span>
              {me && (me.isAdmin || me.id === c.user.id) && (
                <button
                  onClick={() => remove(c.id)}
                  aria-label={t('reactions.delete')}
                  title={t('reactions.delete')}
                  className="text-text-tertiary hover:text-text-primary shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="flex items-center gap-2">
        <input
          value={body}
          onChange={e => setBody(e.target.value)}
          maxLength={MAX_COMMENT_LENGTH}
          placeholder={t('reactions.placeholder')}
          className="flex-1 min-w-0 h-8 px-3 rounded-full bg-surface-2 border border-border text-sm outline-none focus:border-accent"
        />
        {getPosition && (
          <label className="flex items-center gap-1 text-xs text-text-secondary shrink-0">
            <input type="checkbox" checked={atTime} onChange={e => setAtTime(e.target.checked)} />
            {t('reactions.attachTime', { time: formatTime(position) })}
          </label>
        )}
        <button
          type="submit"
          disabled={busy || !body.trim()}
          className="h-8 px-3 rounded-full bg-accent text-white text-sm disabled:opacity-40"
        >
          {t('reactions.post')}
        </button>
      </form>
    </div>
  )
}

/** Compact reactions + comments block for the bottom of AlbumView. */
export function AlbumSocialSection({ albumId }: { albumId: string }) {
  const { t } = useT()
  if (!useSocialReady()) return null
  return (
    <section className="mt-8 max-w-2xl">
      <h2 className="text-sm font-semibold text-text-secondary mb-3">{t('reactions.title')}</h2>
      <ItemSocialPanel itemId={albumId} itemType="album" />
    </section>
  )
}

/** Small button that opens the current track's reactions/comments in a popover. */
export function TrackReactionsButton({ trackId, getPosition, onSeek, className = 'relative' }:
  { trackId: string; getPosition?: () => number; onSeek?: (s: number) => void; className?: string }) {
  const { t } = useT()
  const ready = useSocialReady()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  if (!ready) return null
  return (
    <div className={className}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={t('reactions.open')}
        title={t('reactions.open')}
        aria-expanded={open}
        className={`p-2 rounded-full transition-colors no-drag ${open ? 'bg-white/20 text-white' : 'bg-white/10 text-text-tertiary hover:bg-white/20'}`}
      >
        <MessageCircle size={20} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={t('reactions.open')}
          className="absolute right-0 top-12 w-80 max-w-[90vw] p-4 rounded-lg bg-surface-1/95 border border-border shadow-lg shadow-black/50 z-20"
        >
          <ItemSocialPanel itemId={trackId} itemType="track" getPosition={getPosition} onSeek={onSeek} />
        </div>
      )}
    </div>
  )
}

/** Batch reaction counts for a list of item ids (empty when unconfigured or failing). */
export function useReactionSummary(ids: string[]): Record<string, ItemSummary> {
  const ready = useSocialReady()
  const [summary, setSummary] = useState<Record<string, ItemSummary>>({})
  const key = ids.join(',')
  useEffect(() => {
    if (!ready || ids.length === 0) return
    let alive = true
    getSummary(ids).then(s => { if (alive) setSummary(s) }).catch(() => {})
    return () => { alive = false }
  }, [ready, key])
  return summary
}

export function ReactionBadge({ summary }: { summary?: ItemSummary }) {
  const { tn } = useT()
  if (!summary?.reactions) return null
  return (
    <span aria-label={tn('reactions.summary', summary.reactions)} className="text-xs text-text-tertiary shrink-0 tabular-nums">
      {summary.top.slice(0, 2).join('')}{summary.reactions}
    </span>
  )
}
