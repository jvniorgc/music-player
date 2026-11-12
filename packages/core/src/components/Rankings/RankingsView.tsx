import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trophy, Loader2, Settings, Lock } from 'lucide-react'
import { jellyfin } from '../../services/jellyfin'
import { isConfigured, loadConfig, autoDetect } from '../../services/social'
import {
  getWeekRanking, getAchievements, getRecentDiscoveries,
  type WeekRanking, type RankedItem, type AchievementSummary, type Discovery,
} from '../../services/plays'
import { buttonClass } from '../UI/Button'
import { formatDate, formatNumber, useT, type MessageKey } from '../../i18n'

const WEEKS = [0, 1] as const

interface Data { week: WeekRanking; achievements: AchievementSummary[]; discoveries: Discovery[] }

export default function RankingsView() {
  const { t, locale } = useT()
  const [ready, setReady] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    loadConfig().then(() => autoDetect(jellyfin.serverUrl)).then(() => {
      setConfigured(isConfigured())
      setReady(true)
    })
  }, [])

  const load = useCallback(async () => {
    setData(null)
    setError(false)
    try {
      const [week, achievements, discoveries] = await Promise.all([getWeekRanking(offset), getAchievements(), getRecentDiscoveries()])
      setData({ week, achievements, discoveries })
    } catch {
      setError(true)
    }
  }, [offset])

  useEffect(() => {
    if (configured) load()
  }, [configured, load])

  if (!ready) return <div className="py-16 flex justify-center"><Loader2 size={24} className="animate-spin text-text-tertiary" /></div>

  if (!configured) {
    return (
      <div className="fade-in flex flex-col items-center justify-center py-24 text-text-tertiary gap-4">
        <Trophy size={48} strokeWidth={1} />
        <p>{t('rankings.notConfigured')}</p>
        <Link to="/settings#social-server" className={buttonClass('secondary')}>
          <Settings size={14} /> {t('rankings.openSettings')}
        </Link>
      </div>
    )
  }

  const plays = (n: number) => t('rankings.plays', { count: formatNumber(n) })
  const mins = (n: number) => t('rankings.minutes', { count: formatNumber(n) })

  const list = (title: MessageKey, items: RankedItem[], link?: (i: RankedItem) => string | null) => (
    <section className="bg-surface-1 rounded-lg p-4">
      <h2 className="font-semibold mb-3">{t(title)}</h2>
      {items.length === 0 ? <p className="text-sm text-text-tertiary">{t('rankings.empty')}</p> : (
        <ol className="space-y-2">
          {items.map((i, n) => {
            const to = link?.(i)
            return (
              <li key={`${i.id}-${i.name}`} className="flex items-center gap-3 text-sm">
                <span className="w-5 text-right text-text-tertiary tabular-nums">{n + 1}</span>
                <div className="min-w-0 flex-1">
                  {to ? <Link to={to} className="block truncate hover:underline">{i.name}</Link> : <p className="truncate">{i.name}</p>}
                  {i.artists && <p className="truncate text-xs text-text-secondary">{i.artists}</p>}
                </div>
                <span className="text-xs text-text-tertiary whitespace-nowrap">{plays(i.plays)}</span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )

  return (
    <div className="fade-in pb-8">
      <div className="mb-6">
        <h1 className="text-title font-semibold flex items-center gap-2"><Trophy size={22} className="text-accent" /> {t('rankings.title')}</h1>
        <p className="text-sm text-text-secondary mt-1">{t('rankings.subtitle')}</p>
      </div>

      <div role="tablist" className="flex gap-2 mb-4">
        {WEEKS.map(w => (
          <button
            key={w}
            role="tab"
            aria-selected={offset === w}
            onClick={() => setOffset(w)}
            className={`px-3 py-1.5 rounded-full text-sm transition-colors ${offset === w ? 'bg-accent text-white' : 'bg-surface-2 text-text-secondary hover:text-text-primary'}`}
          >
            {t(w === 0 ? 'rankings.thisWeek' : 'rankings.lastWeek')}
          </button>
        ))}
      </div>

      {error ? (
        <div className="py-16 flex flex-col items-center gap-3 text-text-tertiary">
          <p>{t('rankings.loadError')}</p>
          <button onClick={load} className={buttonClass('secondary')}>{t('rankings.retry')}</button>
        </div>
      ) : !data ? (
        <div className="py-16 flex justify-center"><Loader2 size={24} className="animate-spin text-text-tertiary" /></div>
      ) : (
        <div className="space-y-6">
          <section className="bg-surface-1 rounded-lg p-4">
            <h2 className="font-semibold mb-3">{t('rankings.listeners')}</h2>
            {data.week.listeners.length === 0 ? <p className="text-sm text-text-tertiary">{t('rankings.empty')}</p> : (
              <ol className="space-y-2">
                {data.week.listeners.map((l, n) => (
                  <li key={l.user.id} className="flex items-center gap-3 text-sm">
                    <span className="w-5 text-right text-text-tertiary tabular-nums">{n + 1}</span>
                    <Link to={`/social/user/${l.user.id}`} className="flex-1 truncate hover:underline">{l.user.name}</Link>
                    <span className="text-xs text-text-tertiary whitespace-nowrap">{mins(l.minutes)} · {plays(l.plays)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <div className="grid gap-4 md:grid-cols-3">
            {list('rankings.topTracks', data.week.tracks, i => (i.albumId ? `/album/${i.albumId}` : null))}
            {list('rankings.topAlbums', data.week.albums, i => `/album/${i.id}`)}
            {list('rankings.topArtists', data.week.artists, i => (i.id ? `/artist/${i.id}` : null))}
          </div>

          <section>
            <h2 className="font-semibold mb-3">{t('rankings.achievements')}</h2>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
              {data.achievements.map(a => (
                <div key={a.id} data-testid={`achievement-${a.id}`} className="bg-surface-1 rounded-lg p-4">
                  <p className="font-medium flex items-center gap-2">
                    {a.unlocked.length ? <Trophy size={14} className="text-accent" /> : <Lock size={14} className="text-text-tertiary" />}
                    {t(`rankings.ach.${a.id}` as MessageKey)}
                  </p>
                  <p className="text-xs text-text-secondary mt-1">{t(`rankings.ach.${a.id}.desc` as MessageKey)}</p>
                  <p className="text-xs mt-2 text-text-tertiary">
                    {a.unlocked.length ? a.unlocked.map(u => u.user.name).join(', ') : t('rankings.nobodyYet')}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-surface-1 rounded-lg p-4">
            <h2 className="font-semibold mb-3">{t('rankings.discoveries')}</h2>
            {data.discoveries.length === 0 ? <p className="text-sm text-text-tertiary">{t('rankings.empty')}</p> : (
              <ul className="space-y-2">
                {data.discoveries.map(d => (
                  <li key={d.albumId} className="flex items-center gap-3 text-sm">
                    <Link to={`/album/${d.albumId}`} className="flex-1 min-w-0 truncate hover:underline">
                      {d.albumName} <span className="text-text-secondary">· {d.artists}</span>
                    </Link>
                    <span className="text-xs text-text-tertiary whitespace-nowrap">
                      {t('rankings.discoveredBy', { name: d.user.name })} · {formatDate(d.playedAt, { dateStyle: 'medium' }, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
