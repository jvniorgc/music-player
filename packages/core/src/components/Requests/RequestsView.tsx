import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Inbox, Loader2, Plus, ThumbsUp, Trash2, Check, X, PackageCheck, Search, Disc3, Settings } from 'lucide-react'
import {
  isConfigured, loadConfig, getMe, listRequests, createRequest, vote, unvote, updateRequest, deleteRequest,
  DuplicateRequestError, type AlbumRequest, type Me, type RequestStatus,
} from '../../services/social'
import { searchReleases, getCoverArtUrl, getArtistName, formatMBDate, type MBRelease } from '../../services/musicbrainz'
import { useToastStore } from '../../stores/toast'
import { Button, Input, buttonClass } from '../UI/Button'
import { Modal, InputModal } from '../UI/Modal'
import { formatDate, useT, type MessageKey } from '../../i18n'

type Filter = RequestStatus | 'all'
const FILTERS: Filter[] = ['pending', 'approved', 'fulfilled', 'rejected', 'all']

export default function RequestsView() {
  const { t, locale } = useT()
  const toast = useToastStore(s => s.show)
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [me, setMe] = useState<Me | null>(null)
  const [filter, setFilter] = useState<Filter>('pending')
  const [items, setItems] = useState<AlbumRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [highlight, setHighlight] = useState<number | null>(null)
  const [rejecting, setRejecting] = useState<AlbumRequest | null>(null)

  useEffect(() => {
    loadConfig().then(() => {
      const ok = isConfigured()
      setConfigured(ok)
      setReady(true)
      if (ok) getMe().then(setMe).catch(() => {})
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      setItems(await listRequests(filter === 'all' ? undefined : filter))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    if (configured) load()
  }, [configured, load])

  const replace = (r: AlbumRequest) => {
    setItems(list => {
      const keep = filter === 'all' || r.status === filter
      if (!list.some(i => i.id === r.id)) return keep ? [r, ...list] : list
      return keep ? list.map(i => (i.id === r.id ? r : i)) : list.filter(i => i.id !== r.id)
    })
  }

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn()
    } catch (err) {
      toast(err instanceof Error && err.message ? err.message : t('requests.error'), 'error')
    }
  }

  const handleVote = (r: AlbumRequest) => run(async () => replace(await (r.votedByMe ? unvote(r.id) : vote(r.id))))

  const handleDelete = (r: AlbumRequest) => run(async () => {
    await deleteRequest(r.id)
    setItems(list => list.filter(i => i.id !== r.id))
    toast(t('requests.deleted'), 'success')
  })

  const handleStatus = (r: AlbumRequest, status: RequestStatus, adminNote?: string) => run(async () => {
    replace(await updateRequest(r.id, adminNote ? { status, adminNote } : { status }))
    toast(t('requests.updated'), 'success')
  })

  const handleCreated = (r: AlbumRequest, duplicate: boolean) => {
    setModalOpen(false)
    setHighlight(r.id)
    if (duplicate) {
      setItems(list => (list.some(i => i.id === r.id) ? list : [r, ...list]))
      toast(t('requests.duplicate'), 'info')
    } else {
      replace(r)
      toast(t('requests.created'), 'success')
    }
  }

  if (!ready) {
    return <div className="py-16 flex justify-center"><Loader2 size={24} className="animate-spin text-text-tertiary" /></div>
  }

  if (!configured) {
    return (
      <div className="fade-in flex flex-col items-center justify-center py-24 text-text-tertiary gap-4">
        <Inbox size={48} strokeWidth={1} />
        <p>{t('requests.notConfigured')}</p>
        <Link to="/settings#social-server" className={buttonClass('secondary')}>
          <Settings size={14} /> {t('requests.openSettings')}
        </Link>
      </div>
    )
  }

  return (
    <div className="fade-in pb-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-title font-semibold">{t('requests.title')}</h1>
          <p className="text-sm text-text-secondary mt-1">{t('requests.subtitle')}</p>
        </div>
        <Button onClick={() => setModalOpen(true)}><Plus size={14} /> {t('requests.new')}</Button>
      </div>

      <div role="tablist" className="flex gap-2 mb-4">
        {FILTERS.map(f => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-sm transition-colors ${filter === f ? 'bg-accent text-white' : 'bg-surface-2 text-text-secondary hover:text-text-primary'}`}
          >
            {t(`requests.filter.${f}` as MessageKey)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 size={24} className="animate-spin text-text-tertiary" /></div>
      ) : error ? (
        <div className="py-16 flex flex-col items-center gap-3 text-text-tertiary">
          <p>{t('requests.loadError')}</p>
          <button onClick={load} className={buttonClass('secondary')}>{t('requests.retry')}</button>
        </div>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-text-tertiary">{t('requests.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {items.map(r => {
            const canDelete = me?.isAdmin || (me?.id === r.requestedBy.id && r.status === 'pending')
            return (
              <li
                key={r.id}
                data-testid={`request-${r.id}`}
                className={`flex gap-4 p-3 rounded-md bg-surface-1 border border-border ${highlight === r.id ? 'ring-2 ring-accent' : ''}`}
              >
                {r.coverUrl
                  ? <img src={r.coverUrl} alt="" className="w-16 h-16 rounded-sm object-cover shrink-0 bg-surface-2" />
                  : <div className="w-16 h-16 rounded-sm bg-surface-2 flex items-center justify-center shrink-0 text-text-tertiary"><Disc3 size={24} /></div>}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{r.title}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-text-secondary">{t(`requests.status.${r.status}` as MessageKey)}</span>
                  </div>
                  <p className="text-sm text-text-secondary truncate">{r.artist}{r.year ? ` · ${r.year}` : ''}</p>
                  <p className="text-xs text-text-tertiary mt-1">
                    {t('requests.requestedBy', { name: r.requestedBy.name, date: formatDate(r.createdAt, { dateStyle: 'medium' }, locale) })}
                  </p>
                  {r.note && <p className="text-sm mt-1">{r.note}</p>}
                  {r.adminNote && <p className="text-xs text-text-secondary mt-1">{t('requests.adminNote', { note: r.adminNote })}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {me?.isAdmin && r.status === 'approved' && (
                    <Button variant="icon" aria-label={t('requests.searchSoulseek')} title={t('requests.searchSoulseek')}
                      onClick={() => navigate(`/soulseek?q=${encodeURIComponent(`${r.artist} ${r.title}`)}`)}>
                      <Search size={16} />
                    </Button>
                  )}
                  {me?.isAdmin && r.status !== 'approved' && r.status !== 'fulfilled' && (
                    <Button variant="icon" aria-label={t('requests.approve')} title={t('requests.approve')} onClick={() => handleStatus(r, 'approved')}>
                      <Check size={16} />
                    </Button>
                  )}
                  {me?.isAdmin && r.status !== 'fulfilled' && (
                    <Button variant="icon" aria-label={t('requests.markAdded')} title={t('requests.markAdded')} onClick={() => handleStatus(r, 'fulfilled')}>
                      <PackageCheck size={16} />
                    </Button>
                  )}
                  {me?.isAdmin && r.status !== 'rejected' && (
                    <Button variant="icon" aria-label={t('requests.reject')} title={t('requests.reject')} onClick={() => setRejecting(r)}>
                      <X size={16} />
                    </Button>
                  )}
                  {canDelete && (
                    <Button variant="icon" aria-label={t('requests.delete')} title={t('requests.delete')} onClick={() => handleDelete(r)}>
                      <Trash2 size={16} />
                    </Button>
                  )}
                  <button
                    onClick={() => handleVote(r)}
                    aria-label={r.votedByMe ? t('requests.unvote') : t('requests.vote')}
                    title={r.voters.map(v => v.name).join(', ')}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm transition-colors ${r.votedByMe ? 'bg-accent text-white' : 'bg-surface-2 text-text-secondary hover:text-text-primary'}`}
                  >
                    <ThumbsUp size={14} /> {r.votes}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <NewRequestModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={handleCreated} />
      <InputModal
        open={rejecting !== null}
        title={t('requests.reject')}
        placeholder={t('requests.rejectNote')}
        confirmLabel={t('common.confirm')}
        allowEmpty
        onClose={() => setRejecting(null)}
        onConfirm={note => { if (rejecting) handleStatus(rejecting, 'rejected', note || undefined) }}
      />
    </div>
  )
}

function NewRequestModal({ open, onClose, onCreated }: {
  open: boolean
  onClose: () => void
  onCreated: (r: AlbumRequest, duplicate: boolean) => void
}) {
  const { t } = useT()
  const toast = useToastStore(s => s.show)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MBRelease[]>([])
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState<MBRelease | null>(null)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setQuery(''); setResults([]); setPicked(null); setTitle(''); setArtist(''); setNote('')
    }
  }, [open])

  useEffect(() => {
    const q = query.trim()
    if (!q) { setResults([]); return }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        setResults(await searchReleases(q, undefined, 10, controller.signal))
      } catch {
        if (!controller.signal.aborted) setResults([])
      } finally {
        if (!controller.signal.aborted) setSearching(false)
      }
    }, 400)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query])

  const pick = (r: MBRelease) => {
    setPicked(r)
    setTitle(r.title)
    setArtist(getArtistName(r))
  }

  const submit = async () => {
    setSubmitting(true)
    const body = {
      title: title.trim(),
      artist: artist.trim(),
      ...(picked && formatMBDate(picked.date) ? { year: formatMBDate(picked.date) } : {}),
      ...(picked ? { mbReleaseId: picked.id, coverUrl: getCoverArtUrl(picked.id, 250) } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    }
    try {
      onCreated(await createRequest(body), false)
    } catch (err) {
      if (err instanceof DuplicateRequestError) onCreated(err.request, true)
      else toast(err instanceof Error && err.message ? err.message : t('requests.error'), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} title={t('requests.new')} onClose={onClose}>
      <div className="space-y-3">
        <Input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('requests.searchPlaceholder')} autoFocus />
        {searching ? (
          <p className="text-sm text-text-tertiary flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> {t('requests.searching')}</p>
        ) : query.trim() && results.length === 0 ? (
          <p className="text-sm text-text-tertiary">{t('requests.noResults')}</p>
        ) : results.length > 0 && (
          <ul className="max-h-56 overflow-y-auto space-y-1">
            {results.map(r => (
              <li key={r.id}>
                <button
                  onClick={() => pick(r)}
                  className={`w-full flex items-center gap-3 p-2 rounded-sm text-left hover:bg-surface-2 ${picked?.id === r.id ? 'bg-surface-2 ring-1 ring-accent' : ''}`}
                >
                  <img src={getCoverArtUrl(r.id, 250)} alt="" className="w-10 h-10 rounded-sm object-cover bg-surface-2 shrink-0"
                    onError={e => { e.currentTarget.style.visibility = 'hidden' }} />
                  <span className="min-w-0">
                    <span className="block text-sm truncate">{r.title}</span>
                    <span className="block text-xs text-text-secondary truncate">{getArtistName(r)}{r.date ? ` · ${formatMBDate(r.date)}` : ''}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-text-tertiary pt-1">{t('requests.manual')}</p>
        <Input value={title} onChange={e => { setTitle(e.target.value); setPicked(null) }} placeholder={t('requests.albumTitle')} />
        <Input value={artist} onChange={e => { setArtist(e.target.value); setPicked(null) }} placeholder={t('requests.artist')} />
        <Input value={note} onChange={e => setNote(e.target.value)} placeholder={t('requests.note')} />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={submit} disabled={submitting || !title.trim() || !artist.trim()}>
            {submitting && <Loader2 size={14} className="animate-spin" />} {t('requests.submit')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
