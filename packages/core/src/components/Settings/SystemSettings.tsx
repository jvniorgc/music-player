import { useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useT } from '../../i18n'
import { useToastStore } from '../../stores/toast'
import { useSystemPrefs } from '../../stores/prefs/system'
import { buttonClass } from '../UI/Button'
import { Switch, SettingRow, selectClass } from './PrivacySettings'
import type { SystemSettings as NativeSettings, SystemSettingsState } from '../../platform'

export function SystemSettings() {
  const { t } = useT()
  const toast = useToastStore(s => s.show)
  const prefs = useSystemPrefs(s => s.values)
  const setPrefs = useSystemPrefs(s => s.set)
  const [native, setNative] = useState<SystemSettingsState | null>(null)

  useEffect(() => {
    window.api.systemGetSettings?.().then(setNative).catch(() => {})
  }, [])

  const update = async (patch: Partial<NativeSettings>) => {
    try {
      setNative(await window.api.systemSetSettings!(patch))
    } catch {
      toast(t('prefs.system.failed'), 'error')
    }
  }

  return (
    <div className="space-y-1">
      {native && (
        <>
          <SettingRow label={t('prefs.system.launchAtLogin')}>
            <Switch checked={native.launchAtLogin} label={t('prefs.system.launchAtLogin')} onChange={v => update({ launchAtLogin: v })} />
          </SettingRow>
          <SettingRow label={t('prefs.system.startMinimized')}>
            <Switch checked={native.startMinimized} label={t('prefs.system.startMinimized')} onChange={v => update({ startMinimized: v })} />
          </SettingRow>
          <SettingRow label={t('prefs.system.closeBehavior')}>
            <select
              value={native.closeToTray ? 'tray' : 'quit'}
              onChange={e => update({ closeToTray: e.target.value === 'tray' })}
              className={selectClass}
              aria-label={t('prefs.system.closeBehavior')}
            >
              <option value="quit">{t('prefs.system.closeQuit')}</option>
              <option value="tray">{t('prefs.system.closeTray')}</option>
            </select>
          </SettingRow>
        </>
      )}
      <SettingRow label={t('prefs.system.resumeSession')}>
        <Switch checked={prefs.resumeSession} label={t('prefs.system.resumeSession')} onChange={v => setPrefs({ resumeSession: v })} />
      </SettingRow>
      {prefs.resumeSession && (
        <SettingRow label={t('prefs.system.resumeAutoplay')}>
          <Switch checked={prefs.resumeAutoplay} label={t('prefs.system.resumeAutoplay')} onChange={v => setPrefs({ resumeAutoplay: v })} />
        </SettingRow>
      )}
      {native && (
        <>
          <SettingRow label={t('prefs.system.hardwareAcceleration')}>
            <Switch checked={native.hardwareAcceleration} label={t('prefs.system.hardwareAcceleration')} onChange={v => update({ hardwareAcceleration: v })} />
          </SettingRow>
          {native.restartRequired && (
            <div className="flex items-center justify-between gap-4 py-2" role="status">
              <p className="text-xs text-text-tertiary">{t('prefs.system.restartRequired')}</p>
              <button onClick={() => window.api.systemRelaunch?.()} className={buttonClass('secondary')}>
                <RotateCcw size={14} /> {t('prefs.system.restart')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
