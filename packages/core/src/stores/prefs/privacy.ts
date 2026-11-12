import { createPreferences } from '../../lib/preferences'
import { clearRecentSearches } from '../../lib/recentSearches'
import { clearPopularityCache } from '../../services/popularity'

export type PrivateExpiry = 'never' | '1h' | 'restart'
export const PRIVATE_EXPIRY_OPTIONS: PrivateExpiry[] = ['never', '1h', 'restart']
export const PRIVATE_HOUR_MS = 60 * 60 * 1000

export const usePrivacyPrefs = createPreferences('privacy', {
  privateSession: false as boolean,
  privateExpiry: 'never' as string,
  /** Epoch ms when a '1h' private session ends (0 = no deadline). */
  privateUntil: 0,
  reportPlays: true as boolean,
})

/** While on: no scrobbles, Discord presence, Jellyfin play reports or saved searches. */
export function isPrivateSession(now = Date.now()): boolean {
  const v = usePrivacyPrefs.getState().values
  if (!v.privateSession) return false
  if (v.privateExpiry === '1h' && v.privateUntil <= now) {
    usePrivacyPrefs.getState().set({ privateSession: false, privateUntil: 0 })
    return false
  }
  return true
}

export function setPrivateSession(on: boolean, expiry?: PrivateExpiry): void {
  const privateExpiry = expiry ?? usePrivacyPrefs.getState().values.privateExpiry
  usePrivacyPrefs.getState().set({
    privateSession: on,
    privateExpiry,
    privateUntil: on && privateExpiry === '1h' ? Date.now() + PRIVATE_HOUR_MS : 0,
  })
}

/** Whether playback start/stop should be reported to Jellyfin. */
export function shouldReportPlays(): boolean {
  return usePrivacyPrefs.getState().values.reportPlays && !isPrivateSession()
}

/** Removes locally stored listening data (recent searches, Last.fm popularity cache). */
export function clearListeningData(): void {
  clearRecentSearches()
  clearPopularityCache()
}

// An "until restart" private session ends when the app starts again.
if (usePrivacyPrefs.getState().values.privateExpiry === 'restart' && usePrivacyPrefs.getState().values.privateSession) {
  usePrivacyPrefs.getState().set({ privateSession: false })
}
