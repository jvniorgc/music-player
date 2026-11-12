import { useEffect, useState } from 'react'
import { Compass } from 'lucide-react'
import { isConfigured } from '../../services/social'
import { getDiscoveries, type Discovery } from '../../services/plays'
import { useT } from '../../i18n'

/** "Discovered by X": the first friend who played this album. Renders nothing when unknown/unconfigured. */
export function DiscoveredBadge({ albumId }: { albumId: string }) {
  const { t } = useT()
  const [discovery, setDiscovery] = useState<Discovery | null>(null)

  useEffect(() => {
    setDiscovery(null)
    if (!isConfigured()) return
    let cancelled = false
    getDiscoveries([albumId])
      .then(items => { if (!cancelled) setDiscovery(items.find(d => d.albumId === albumId) ?? null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [albumId])

  if (!discovery) return null
  return (
    <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full bg-surface-2 text-xs text-text-secondary w-fit">
      <Compass size={12} className="text-accent" /> {t('rankings.discoveredBy', { name: discovery.user.name })}
    </span>
  )
}
