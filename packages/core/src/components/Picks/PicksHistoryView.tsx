import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { jellyfin } from '../../services/jellyfin'
import { autoDetect, isConfigured, loadConfig } from '../../services/social'
import { getPicksHistory, type AlbumPick } from '../../services/picks'
import PickCard from './PickCard'
import { formatDate, useT } from '../../i18n'

type State = { status: 'loading' | 'off' | 'error' } | { status: 'ready'; weeks: { weekStart: string; items: AlbumPick[] }[] }

const localDate = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d) }

export default function PicksHistoryView() {
  const { t, locale } = useT()
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    loadConfig().then(() => autoDetect(jellyfin.serverUrl)).then(() => {
      if (!isConfigured()) return setState({ status: 'off' })
      getPicksHistory().then(weeks => setState({ status: 'ready', weeks }), () => setState({ status: 'error' }))
    })
  }, [])

  return (
    <div className="space-y-8">
      <h1 className="text-title font-semibold">{t('picks.historyTitle')}</h1>
      {state.status === 'off' && (
        <p className="text-sm text-text-secondary">
          {t('picks.notConfigured')}{' '}
          <Link to="/settings" className="text-accent hover:text-accent-hover">{t('picks.openSettings')}</Link>
        </p>
      )}
      {state.status === 'error' && <p className="text-sm text-text-secondary">{t('picks.loadFailed')}</p>}
      {state.status === 'ready' && state.weeks.length === 0 && <p className="text-sm text-text-tertiary">{t('picks.historyEmpty')}</p>}
      {state.status === 'ready' && state.weeks.map(w => (
        <section key={w.weekStart}>
          <h2 className="text-heading font-semibold mb-4">{t('picks.weekOf', { date: formatDate(localDate(w.weekStart), { dateStyle: 'medium' }, locale) })}</h2>
          <div className="flex flex-wrap gap-5">
            {w.items.map(p => <PickCard key={p.user.id} pick={p} />)}
          </div>
        </section>
      ))}
    </div>
  )
}
