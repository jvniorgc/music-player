import { useState, type ReactNode } from 'react'
import { useT } from '../../i18n'
import { useNotificationPrefs } from '../../stores/prefs/notifications'
import { requestNotificationPermission } from '../../services/notifications'

function Switch({ checked, label, onToggle, disabled }: { checked: boolean; label: string; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`relative w-10 h-6 shrink-0 rounded-full transition-colors disabled:opacity-40 ${checked ? 'bg-accent' : 'bg-white/15'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
  )
}

export function NotificationSettings() {
  const { t } = useT()
  const prefs = useNotificationPrefs(s => s.values)
  const set = useNotificationPrefs(s => s.set)
  const [denied, setDenied] = useState(false)

  const enable = async (key: 'trackChange' | 'downloadComplete') => {
    if (prefs[key]) return set({ [key]: false })
    const ok = await requestNotificationPermission()
    setDenied(!ok)
    if (ok) set({ [key]: true })
  }

  const row = (label: string, control: ReactNode) => (
    <div className="flex items-center justify-between gap-4 py-2">
      <p className="text-sm text-text-secondary">{label}</p>
      {control}
    </div>
  )

  return (
    <div>
      {denied && <p role="alert" className="text-xs text-warning mb-2">{t('prefs.notify.denied')}</p>}
      {row(t('prefs.notify.trackChange'), <Switch checked={prefs.trackChange} label={t('prefs.notify.trackChange')} onToggle={() => enable('trackChange')} />)}
      {row(t('prefs.notify.onlyUnfocused'), (
        <Switch
          checked={prefs.onlyWhenUnfocused}
          disabled={!prefs.trackChange}
          label={t('prefs.notify.onlyUnfocused')}
          onToggle={() => set({ onlyWhenUnfocused: !prefs.onlyWhenUnfocused })}
        />
      ))}
      {row(t('prefs.notify.downloadComplete'), <Switch checked={prefs.downloadComplete} label={t('prefs.notify.downloadComplete')} onToggle={() => enable('downloadComplete')} />)}
    </div>
  )
}
