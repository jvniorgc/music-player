import { useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useT, type MessageKey } from '../../i18n'
import { buttonClass } from '../UI/Button'
import {
  SHORTCUT_ACTIONS, DEFAULT_BINDINGS, SEEK_STEP, comboFromEvent, effectiveBindings, findConflict, formatCombo,
  type ShortcutAction,
} from '../../lib/shortcuts'
import { useShortcutPrefs, useGlobalShortcutPrefs, GLOBAL_SHORTCUT_DEFAULTS } from '../../stores/prefs/shortcuts'
import { GLOBAL_ACTIONS, useGlobalShortcutStatus } from '../../services/globalShortcuts'
import type { GlobalShortcutAction } from '../../platform'

const kbdClass = 'font-mono text-xs bg-surface-2 border border-border rounded-sm px-1.5 py-0.5'

function Switch({ checked, label, onToggle }: { checked: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={`relative w-10 h-6 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-white/15'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
  )
}

/** Captures the next key combo while active; Esc cancels. */
function useRecorder(onCombo: (id: string, combo: string) => void) {
  const [recording, setRecording] = useState<string | null>(null)
  useEffect(() => {
    if (!recording) return
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') return setRecording(null)
      const combo = comboFromEvent(e)
      if (!combo) return
      setRecording(null)
      onCombo(recording, combo)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [recording, onCombo])
  return [recording, setRecording] as const
}

export function ShortcutSettings({ isMac }: { isMac: boolean }) {
  const { t } = useT()
  const overrides = useShortcutPrefs(s => s.values)
  const setOverrides = useShortcutPrefs(s => s.set)
  const resetAll = useShortcutPrefs(s => s.reset)
  const global = useGlobalShortcutPrefs(s => s.values)
  const setGlobal = useGlobalShortcutPrefs(s => s.set)
  const failed = useGlobalShortcutStatus(s => s.failed)
  const [error, setError] = useState<string | null>(null)
  const bindings = effectiveBindings(overrides)

  const label = (a: ShortcutAction | GlobalShortcutAction | 'history') =>
    t(`prefs.shortcuts.action.${a}` as MessageKey, { seconds: SEEK_STEP })
  const fmt = (combo: string) => formatCombo(combo, isMac)

  const onCombo = (id: string, combo: string) => {
    const [scope, action] = id.split(':') as ['app' | 'global', string]
    if (scope === 'app') {
      const conflict = findConflict(bindings, action, combo)
      if (conflict) return setError(t('prefs.shortcuts.conflict', { combo: fmt(combo), action: label(conflict) }))
      const isDefault = DEFAULT_BINDINGS[action as ShortcutAction].join() === combo
      setOverrides({ [action]: isDefault ? '' : combo })
    } else {
      if (!/^(Mod|Alt)\+/.test(combo)) return setError(t('prefs.shortcuts.needsModifier'))
      const conflict = GLOBAL_ACTIONS.find(a => a !== action && global[a] === combo)
      if (conflict) return setError(t('prefs.shortcuts.conflict', { combo: fmt(combo), action: label(conflict) }))
      setGlobal({ [action]: combo })
    }
    setError(null)
  }
  const [recording, setRecording] = useRecorder(onCombo)

  const row = (id: string, name: string, combos: string[], onReset: (() => void) | null, warn?: string) => (
    <div key={id} className="flex items-center justify-between gap-4 py-2">
      <dt className="text-text-secondary">
        {name}
        {warn && <span className="block text-xs text-warning">{warn}</span>}
      </dt>
      <dd className="flex items-center gap-2">
        <button
          aria-label={t('prefs.shortcuts.record', { action: name })}
          onClick={() => { setError(null); setRecording(recording === id ? null : id) }}
          className={`rounded-sm hover:bg-surface-2 ${recording === id ? 'ring-1 ring-accent' : ''}`}
        >
          {recording === id
            ? <span className={kbdClass}>{t('prefs.shortcuts.recording')}</span>
            : combos.map(c => <kbd key={c} className={`${kbdClass} ml-1 first:ml-0`}>{fmt(c)}</kbd>)}
        </button>
        <button
          aria-label={t('prefs.shortcuts.resetAction', { action: name })}
          title={t('prefs.shortcuts.reset')}
          disabled={!onReset}
          onClick={() => onReset?.()}
          className="p-1 text-text-secondary hover:text-text-primary disabled:invisible"
        >
          <RotateCcw size={14} />
        </button>
      </dd>
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium">{t('prefs.shortcuts.title')}</h3>
          <button className={buttonClass('secondary', 'text-xs')} onClick={() => { resetAll(); setError(null) }}>
            {t('prefs.shortcuts.resetAll')}
          </button>
        </div>
        <p className="text-xs text-text-secondary mb-2">{t('prefs.shortcuts.hint')}</p>
        {error && <p role="alert" className="text-xs text-warning mb-2">{error}</p>}
        <dl className="divide-y divide-border text-sm">
          {SHORTCUT_ACTIONS.map(a => row(`app:${a}`, label(a), bindings[a], overrides[a] ? () => setOverrides({ [a]: '' }) : null))}
          <div className="flex justify-between py-2">
            <dt className="text-text-secondary">{label('history')}</dt>
            <dd><kbd className={kbdClass}>{fmt('Alt+ArrowLeft')} / →</kbd></dd>
          </div>
        </dl>
      </div>

      <div>
        <div className="flex items-center justify-between gap-4 mb-2">
          <div>
            <h3 className="text-sm font-medium">{t('prefs.shortcuts.global')}</h3>
            <p className="text-xs text-text-secondary">{t('prefs.shortcuts.globalEnable')}</p>
          </div>
          <Switch checked={global.enabled} label={t('prefs.shortcuts.global')} onToggle={() => setGlobal({ enabled: !global.enabled })} />
        </div>
        {global.enabled && (
          <dl className="divide-y divide-border text-sm">
            {GLOBAL_ACTIONS.map(a => row(
              `global:${a}`, label(a), [global[a]],
              global[a] !== GLOBAL_SHORTCUT_DEFAULTS[a] ? () => setGlobal({ [a]: GLOBAL_SHORTCUT_DEFAULTS[a] }) : null,
              failed.includes(a) ? t('prefs.shortcuts.globalFailed') : undefined,
            ))}
          </dl>
        )}
      </div>
    </div>
  )
}
