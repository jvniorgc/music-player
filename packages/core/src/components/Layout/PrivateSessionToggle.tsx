import { useEffect } from 'react'
import { EyeOff } from 'lucide-react'
import { useT } from '../../i18n'
import { usePrivacyPrefs, setPrivateSession, isPrivateSession } from '../../stores/prefs/privacy'

/** Sidebar quick toggle; shows a labeled badge while a private session is active. */
export function PrivateSessionToggle() {
  const { t } = useT()
  const active = usePrivacyPrefs(s => s.values.privateSession)
  const until = usePrivacyPrefs(s => s.values.privateUntil)

  // End a timed session in the UI even while nothing else checks it.
  useEffect(() => {
    if (!active || !until) return
    const timer = setTimeout(() => isPrivateSession(), Math.max(0, until - Date.now()))
    return () => clearTimeout(timer)
  }, [active, until])

  return (
    <button
      onClick={() => setPrivateSession(!active)}
      aria-pressed={active}
      title={active ? t('prefs.privacy.end') : t('prefs.privacy.start')}
      className={`flex items-center gap-3 px-3 py-2 rounded-sm text-sm transition-colors w-full no-drag ${
        active ? 'bg-accent/15 text-accent' : 'text-text-tertiary hover:text-text-primary hover:bg-white/5'
      }`}
    >
      <EyeOff size={16} />
      <span className="truncate">{active ? t('prefs.privacy.privateSession') : t('prefs.privacy.start')}</span>
    </button>
  )
}
