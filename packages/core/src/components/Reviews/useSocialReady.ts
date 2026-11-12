import { useEffect, useState } from 'react'
import { autoDetect, isConfigured, loadConfig } from '../../services/social'
import { jellyfin } from '../../services/jellyfin'

/** null while checking, then whether the social server is configured. */
export function useSocialReady(): boolean | null {
  const [ready, setReady] = useState<boolean | null>(null)
  useEffect(() => {
    let alive = true
    loadConfig().then(() => autoDetect(jellyfin.serverUrl)).catch(() => false).then(() => { if (alive) setReady(isConfigured()) })
    return () => { alive = false }
  }, [])
  return ready
}
