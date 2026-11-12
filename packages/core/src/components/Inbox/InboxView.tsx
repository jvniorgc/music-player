import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, Heart, Loader2, Mail, Settings, ThumbsUp, Trash2 } from 'lucide-react'
import { isConfigured, loadConfig, autoDetect } from '../../services/social'
import {
  getInbox, getSent, markListened, setReaction, deleteRecommendation, type FriendRec, type Reaction,
} from '../../services/friendRecs'
import { jellyfin } from '../../services/jellyfin'
import { usePlayerStore } from '../../stores/player'
import { useToastStore } from '../../stores/toast'
import { useInboxStore } from '../../stores/inbox'
import { Button, buttonClass } from '../UI/Button'
import CoverArt from '../UI/CoverArt'
import { formatDate, useT, type MessageKey } from '../../i18n'

type Tab = 'received' | 'sent'
const TYPE_KEY: Record<FriendRec['item']['type'], MessageKey> = {
  track: 'inbox.typeTrack', album: 'inbox.typeAlbum', artist: 'inbox.typeArtist',
}

export default function InboxView() {
  const { t, locale } = useT()
  const toast = useToastStore(s => s.show)
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [tab, setTab] = useState<Tab>('received')
  const [items, setItems] = useState<FriendRec[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    loadConfig().then(() => autoDetect(jellyfin.serverUrl)).then(() => {
      const ok = isConfigured()
      setConfigured(ok)
      setReady(true)
      if (ok && !useInboxStore.getState().configured) useInboxStore.setState({ configured: true })
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      setItems(await (tab === 'received' ? getInbox() : getSent()))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => {
    if (configured) load()
  }, [configured, load])

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn()
    } catch {
      toast(t('inbox.actionFailed'), 'error')
    }
  }
  const replace = (r: FriendRec) => setItems(list => list.map(i => (i.id === r.id ? r : i)))
  const refreshBadge = () => { useInboxStore.getState().refresh() }

  const listened = (r: FriendRec) => run(async () => { replace(await markListened(r.id)); refreshBadge() })
  const react = (r: FriendRec, reaction: Reaction) =>
    run(async () => replace(await setReaction(r.id, r.reaction === reaction ? null : reaction)))
  const remove = (r: FriendRec) => run(async () => {
    await deleteRecommendation(r.id)
    setItems(list => list.filter(i => i.id !== r.id))
    refreshBadge()
  })

  const open = async (r: FriendRec) => {
    if (r.item.type === 'album') return navigate(`/album/${r.item.id}`)
    if (r.item.type === 'artist') return navigate(`/artist/${r.item.id}`)
    try {
      usePlayerStore.getState().playItems([await jellyfin.getItem(r.item.id)], 0)
    } catch {
      toast(t('inbox.playFailed'), 'error')
    }
  }

  if (!ready) {
    return <div className="py-16 flex justify-center"><Loader2 size={24} className="animate-spin text-text-tertiary" /></div>
  }

  if (!configured) {
    return (
      <div className="fade-in flex flex-col items-center justify-center py-24 text-text-tertiary gap-4">
        <Mail size={48} strokeWidth={1} />
        <p>{t('inbox.notConfigured')}</p>
        <Link to="/settings#social-server" className={buttonClass('secondary')}>
          <Settings size={14} /> {t('inbox.openSettings')}
        </Link>
      </div>
    )
  }

  const received = tab === 'received'
  const tabClass = (on: boolean) =>
    `px-3 py-1.5 rounded-full text-sm transition-colors ${on ? 'bg-white/10 text-text-primary' : 'text-text-secondary hover:text-text-primary'}`
  const reactBtn = (r: FriendRec, reaction: Reaction) => {
    const Icon = reaction === 'like' ? ThumbsUp : Heart
    const label = t(reaction === 'like' ? 'inbox.like' : 'inbox.love')
    return (
      <Button variant="icon" aria-label={label} title={label} aria-pressed={r.reaction === reaction} onClick={() => react(r, reaction)}>
        <Icon size={15} className={r.reaction === reaction ? 'text-accent' : ''} fill={r.reaction === reaction ? 'currentColor' : 'none'} />
      </Button>
    )
  }

  return (
    <div className="fade-in pb-8">
      <div className="mb-6">
        <h1 className="text-title font-semibold">{t('inbox.title')}</h1>
        <p className="text-sm text-text-secondary mt-1">{t('inbox.subtitle')}</p>
      </div>
      <div role="tablist" className="flex gap-2 mb-4">
        <button role="tab" aria-selected={received} className={tabClass(received)} onClick={() => setTab('received')}>{t('inbox.received')}</button>
        <button role="tab" aria-selected={!received} className={tabClass(!received)} onClick={() => setTab('sent')}>{t('inbox.sent')}</button>
      </div>

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 size={24} className="animate-spin text-text-tertiary" /></div>
      ) : error ? (
        <div className="py-16 flex flex-col items-center gap-3 text-text-tertiary">
          <p>{t('inbox.error')}</p>
          <Button variant="secondary" onClick={load}>{t('inbox.retry')}</Button>
        </div>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-text-tertiary">{t(received ? 'inbox.emptyReceived' : 'inbox.emptySent')}</p>
      ) : (
        <ul className="space-y-2">
          {items.map(r => {
            const cover = r.item.albumId ?? (r.item.type === 'artist' ? r.item.id : null)
            return (
              <li key={r.id} className="flex items-center gap-4 p-3 rounded-lg bg-surface-1 border border-border">
                <button onClick={() => open(r)} className="flex items-center gap-4 flex-1 min-w-0 text-left">
                  <CoverArt
                    src={cover ? jellyfin.getImageUrl(cover, undefined, 96) : null}
                    kind={r.item.type === 'artist' ? 'artist' : r.item.type === 'album' ? 'album' : 'track'}
                    className={`w-12 h-12 shrink-0 overflow-hidden ${r.item.type === 'artist' ? 'rounded-full' : 'rounded-sm'}`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {received && !r.listenedAt && <span className="mr-2 text-xs text-accent">{t('inbox.new')}</span>}
                      {r.item.name}
                    </p>
                    <p className="text-xs text-text-secondary truncate">
                      {t(TYPE_KEY[r.item.type])}{r.item.artist ? ` · ${r.item.artist}` : ''}
                    </p>
                    <p className="text-xs text-text-tertiary truncate">
                      {received ? t('inbox.from', { name: r.from.name }) : t('inbox.to', { name: r.toUserName })}
                      {' · '}{formatDate(r.createdAt, { dateStyle: 'medium' }, locale)}
                    </p>
                    {r.message && <p className="text-sm text-text-primary mt-1 break-words">“{r.message}”</p>}
                  </div>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  {received ? (
                    <>
                      {!r.listenedAt && (
                        <Button variant="icon" aria-label={t('inbox.markListened')} title={t('inbox.markListened')} onClick={() => listened(r)}>
                          <Check size={15} />
                        </Button>
                      )}
                      {reactBtn(r, 'like')}
                      {reactBtn(r, 'love')}
                    </>
                  ) : (
                    <span className="text-xs text-text-tertiary flex items-center gap-1">
                      {r.reaction === 'like' && <ThumbsUp size={13} className="text-accent" aria-label={t('inbox.like')} />}
                      {r.reaction === 'love' && <Heart size={13} className="text-accent" fill="currentColor" aria-label={t('inbox.love')} />}
                      {r.listenedAt ? t('inbox.listened') : t('inbox.notListened')}
                    </span>
                  )}
                  <Button
                    variant="icon"
                    aria-label={t(received ? 'inbox.dismiss' : 'inbox.unsend')}
                    title={t(received ? 'inbox.dismiss' : 'inbox.unsend')}
                    onClick={() => remove(r)}
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
