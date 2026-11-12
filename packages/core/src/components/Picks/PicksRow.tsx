import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { jellyfin } from '../../services/jellyfin'
import { autoDetect, isConfigured, loadConfig } from '../../services/social'
import { daysLeft, deleteMyPick, getCurrentPicks, type PicksWeek } from '../../services/picks'
import { useToastStore } from '../../stores/toast'
import PickCard from './PickCard'
import { PICKS_CHANGED } from './usePickAlbum'
import { useT } from '../../i18n'

/** Home row with this week's album picks; renders nothing when the social server is unavailable. */
export default function PicksRow() {
  const { t, tn } = useT()
  const toast = useToastStore(s => s.show)
  const [week, setWeek] = useState<PicksWeek | null>(null)

  const load = useCallback(() => {
    if (!isConfigured()) return
    getCurrentPicks().then(setWeek, () => setWeek(null))
  }, [])

  useEffect(() => {
    loadConfig().then(() => autoDetect(jellyfin.serverUrl)).then(load, () => {})
    window.addEventListener(PICKS_CHANGED, load)
    return () => window.removeEventListener(PICKS_CHANGED, load)
  }, [load])

  if (!week) return null

  const remove = async () => {
    try {
      await deleteMyPick()
      toast(t('picks.removed'), 'success')
      load()
    } catch {
      toast(t('picks.failed'), 'error')
    }
  }

  const mineId = week.mine?.user.id
  return (
    <section>
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-heading font-semibold">{t('picks.title')}</h2>
          <span className="text-xs text-text-tertiary">{tn('picks.expiresIn', daysLeft(week.expiresAt))}</span>
        </div>
        <Link to="/picks" className="text-sm text-accent hover:text-accent-hover transition-colors">{t('picks.history')}</Link>
      </div>
      <div className="flex gap-5 overflow-x-auto pb-2">
        {week.items.map(p => (
          <PickCard key={p.user.id} pick={p} mine={p.user.id === mineId} onRemove={p.user.id === mineId ? remove : undefined} />
        ))}
      </div>
      {!week.mine && <p className="text-sm text-text-tertiary mt-2">{t('picks.cta')}</p>}
    </section>
  )
}
