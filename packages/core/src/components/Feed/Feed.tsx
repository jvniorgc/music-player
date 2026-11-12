import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Download, Loader2, Newspaper, PackageCheck, Disc3, Settings } from 'lucide-react'
import { isConfigured, loadConfig, autoDetect } from '../../services/social'
import { getFeed, formatRelative, type FeedItem, type SoulseekAlbum } from '../../services/feed'
import { jellyfin } from '../../services/jellyfin'
import CoverArt from '../UI/CoverArt'
import { buttonClass } from '../UI/Button'
import { useT } from '../../i18n'

function useSocialReady() {
  const [state, setState] = useState<{ ready: boolean; configured: boolean }>({ ready: false, configured: false })
  useEffect(() => {
    loadConfig().then(() => autoDetect(jellyfin.serverUrl)).then(() => setState({ ready: true, configured: isConfigured() }))
  }, [])
  return state
}

const albumLabel = (a: SoulseekAlbum) => (a.albumName ? (a.artist ? `${a.albumName} — ${a.artist}` : a.albumName) : a.folder)

interface Chip { key: string; to: string; label: string; cover: string | null }

function FeedEntry({ item, compact }: { item: FeedItem; compact?: boolean }) {
  const { t, locale } = useT()
  let icon = <Disc3 size={16} />
  let title: string
  let detail: string | null = null
  let chips: Chip[] = []
  if (item.type === 'soulseek_download') {
    icon = <Download size={16} />
    title = item.count > 1
      ? t('feed.soulseekMany', { name: item.actor.name, count: item.count })
      : t('feed.soulseekOne', { name: item.actor.name, album: albumLabel(item.albums[0]) })
    if (item.count > 1) detail = item.albums.map(albumLabel).join(', ')
  } else if (item.type === 'request_fulfilled') {
    icon = <PackageCheck size={16} />
    title = t('feed.fulfilled', { name: item.actor.name, title: item.title })
    chips = [{ key: item.id, to: `/search?q=${encodeURIComponent(item.title)}`, label: item.title, cover: item.coverUrl }]
  } else {
    title = item.albums.length > 1
      ? t('feed.libraryMany', { count: item.albums.length })
      : t('feed.libraryOne', { album: item.albums[0].name })
    chips = item.albums.map(a => ({ key: a.id, to: `/album/${a.id}`, label: a.name, cover: jellyfin.getImageUrl(a.id, undefined, 80) }))
  }
  const shown = compact ? chips.slice(0, 4) : chips
  return (
    <li className="flex gap-3 py-3">
      <div className="w-8 h-8 rounded-full bg-surface-2 text-accent flex items-center justify-center shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-text-primary truncate">{title}</p>
          <time className="text-xs text-text-tertiary shrink-0" dateTime={item.time}>{formatRelative(item.time, undefined, locale)}</time>
        </div>
        {detail && <p className="text-xs text-text-secondary truncate">{detail}</p>}
        {shown.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {shown.map(c => (
              <Link key={c.key} to={c.to} className="flex items-center gap-2 pr-3 rounded-sm bg-surface-2 hover:bg-surface-3 text-xs text-text-secondary hover:text-text-primary transition-colors max-w-56">
                <CoverArt src={c.cover} className="w-8 h-8 rounded-sm overflow-hidden shrink-0" kind="album" iconSize={12} />
                <span className="truncate">{c.label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}

/** Compact "What's new" section for the home page; renders nothing without a social server or entries. */
export function HomeFeedSection() {
  const { t } = useT()
  const navigate = useNavigate()
  const { configured } = useSocialReady()
  const [items, setItems] = useState<FeedItem[]>([])

  useEffect(() => {
    if (configured) getFeed({ limit: 5 }).then(p => setItems(p.items)).catch(() => {})
  }, [configured])

  if (!configured || items.length === 0) return null
  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-heading font-semibold">{t('feed.title')}</h2>
        <button onClick={() => navigate('/feed')} className="text-sm text-accent hover:text-accent-hover transition-colors">
          {t('feed.seeAll')}
        </button>
      </div>
      <ul className="divide-y divide-border">
        {items.map(i => <FeedEntry key={i.id} item={i} compact />)}
      </ul>
    </section>
  )
}

export default function FeedView() {
  const { t } = useT()
  const { ready, configured } = useSocialReady()
  const [items, setItems] = useState<FeedItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async (before?: string) => {
    setLoading(true)
    setError(false)
    try {
      const page = await getFeed(before ? { before } : {})
      setItems(list => (before ? [...list, ...page.items] : page.items))
      setCursor(page.nextBefore)
      setLoaded(true)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (configured) load()
  }, [configured, load])

  return (
    <div className="max-w-3xl">
      <h1 className="text-title font-semibold mb-6">{t('feed.title')}</h1>
      {ready && !configured && (
        <div className="flex flex-col items-center py-24 text-text-tertiary">
          <Newspaper size={40} strokeWidth={1.5} className="mb-4" />
          <p className="text-sm mb-4">{t('feed.notConfigured')}</p>
          <Link to="/settings" className={buttonClass('secondary')}><Settings size={14} /> {t('feed.openSettings')}</Link>
        </div>
      )}
      {loaded && items.length === 0 && <p className="text-sm text-text-tertiary py-12 text-center">{t('feed.empty')}</p>}
      {items.length > 0 && (
        <ul className="divide-y divide-border">
          {items.map(i => <FeedEntry key={i.id} item={i} />)}
        </ul>
      )}
      {error && <p className="text-sm text-danger py-4">{t('feed.error')}</p>}
      {loading && <Loader2 size={20} className="animate-spin text-text-tertiary mx-auto my-6" aria-label={t('feed.loading')} />}
      {!loading && configured && (cursor || error) && (
        <div className="flex justify-center mt-4">
          <button onClick={() => load(cursor ?? undefined)} className={buttonClass('secondary')}>{t('feed.loadMore')}</button>
        </div>
      )}
    </div>
  )
}
