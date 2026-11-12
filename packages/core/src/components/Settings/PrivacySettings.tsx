import { useState, type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { useT } from '../../i18n'
import { useToastStore } from '../../stores/toast'
import { buttonClass } from '../UI/Button'
import { ConfirmModal } from '../UI/Modal'
import {
  usePrivacyPrefs, setPrivateSession, clearListeningData, PRIVATE_EXPIRY_OPTIONS, type PrivateExpiry,
} from '../../stores/prefs/privacy'

const EXPIRY_LABELS = {
  never: 'prefs.privacy.expiryNever',
  '1h': 'prefs.privacy.expiry1h',
  restart: 'prefs.privacy.expiryRestart',
} as const

export function Switch({ checked, label, onChange }: { checked: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-6 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-white/15'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
  )
}

export function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <p className="text-sm text-text-secondary">{label}</p>
        {hint && <p className="text-xs text-text-tertiary mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

export const selectClass = 'bg-surface-2 border border-border rounded-sm px-3 py-2 text-sm text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'

export function PrivacySettings() {
  const { t } = useT()
  const toast = useToastStore(s => s.show)
  const values = usePrivacyPrefs(s => s.values)
  const set = usePrivacyPrefs(s => s.set)
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <div className="space-y-1">
      <SettingRow label={t('prefs.privacy.privateSession')} hint={t('prefs.privacy.privateSessionHint')}>
        <Switch checked={values.privateSession} label={t('prefs.privacy.privateSession')} onChange={v => setPrivateSession(v)} />
      </SettingRow>
      <SettingRow label={t('prefs.privacy.expiry')}>
        <select
          value={values.privateExpiry}
          onChange={e => setPrivateSession(values.privateSession, e.target.value as PrivateExpiry)}
          className={selectClass}
          aria-label={t('prefs.privacy.expiry')}
        >
          {PRIVATE_EXPIRY_OPTIONS.map(o => <option key={o} value={o}>{t(EXPIRY_LABELS[o])}</option>)}
        </select>
      </SettingRow>
      <SettingRow label={t('prefs.privacy.reportPlays')} hint={t('prefs.privacy.reportPlaysHint')}>
        <Switch checked={values.reportPlays} label={t('prefs.privacy.reportPlays')} onChange={v => set({ reportPlays: v })} />
      </SettingRow>
      <SettingRow label={t('prefs.privacy.clearData')} hint={t('prefs.privacy.clearDataHint')}>
        <button onClick={() => setConfirmOpen(true)} className={buttonClass('secondary')}>
          <Trash2 size={14} /> {t('prefs.privacy.clearData')}
        </button>
      </SettingRow>
      <ConfirmModal
        open={confirmOpen}
        title={t('prefs.privacy.clearData')}
        message={t('prefs.privacy.clearConfirm')}
        confirmLabel={t('prefs.privacy.clearData')}
        destructive
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          clearListeningData()
          toast(t('prefs.privacy.cleared'), 'success')
        }}
      />
    </div>
  )
}
