import { useSyncExternalStore } from 'react'
import { RotateCcw } from 'lucide-react'
import { audioEffects, EQ_BANDS, EQ_MAX_DB, EQ_PRESET_NAMES, type EqPreset } from '../../services/audioEffects'
import { useT } from '../../i18n'
import type { Messages } from '../../i18n/en'
import { buttonClass } from '../UI/Button'

const subscribe = (fn: () => void) => audioEffects.subscribe(fn)
const getSettings = () => audioEffects.settings

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

export function EqualizerSettings() {
  const s = useSyncExternalStore(subscribe, getSettings)
  const { t } = useT()
  const db = (v: number) => t('eq.db', { value: v > 0 ? `+${v}` : String(v) })
  const bandLabel = (hz: number) => hz >= 1000 ? t('eq.khz', { value: hz / 1000 }) : t('eq.hz', { value: hz })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-text-secondary">{t('eq.enable')}</span>
        <Switch checked={s.enabled} label={t('eq.enable')} onToggle={() => audioEffects.update({ enabled: !s.enabled })} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={s.preset}
          onChange={e => audioEffects.setPreset(e.target.value as EqPreset)}
          disabled={!s.enabled}
          aria-label={t('eq.preset')}
          className="bg-surface-2 border border-border rounded-sm px-3 py-2 text-sm text-text-primary disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {EQ_PRESET_NAMES.map(p => <option key={p} value={p}>{t(`eq.preset.${p}` as keyof Messages)}</option>)}
        </select>
        <button
          onClick={() => { audioEffects.setPreset('flat'); audioEffects.update({ preamp: 0 }) }}
          disabled={!s.enabled}
          className={buttonClass('secondary')}
        >
          <RotateCcw size={14} /> {t('eq.reset')}
        </button>
      </div>

      <div className={`flex items-end justify-between gap-2 ${s.enabled ? '' : 'opacity-40'}`}>
        <div className="flex flex-col items-center gap-2 pr-2 border-r border-border">
          <span className="text-xs text-text-secondary tabular-nums">{db(s.preamp)}</span>
          <input
            type="range" min={-EQ_MAX_DB} max={EQ_MAX_DB} step={1}
            value={s.preamp}
            disabled={!s.enabled}
            aria-label={t('eq.preamp')}
            onChange={e => audioEffects.update({ preamp: Number(e.target.value) })}
            className="h-32 accent-accent [writing-mode:vertical-lr] [direction:rtl]"
          />
          <span className="text-xs text-text-secondary">{t('eq.preamp')}</span>
        </div>
        {EQ_BANDS.map((hz, i) => (
          <div key={hz} className="flex flex-col items-center gap-2">
            <span className="text-xs text-text-secondary tabular-nums">{db(s.gains[i])}</span>
            <input
              type="range" min={-EQ_MAX_DB} max={EQ_MAX_DB} step={1}
              value={s.gains[i]}
              disabled={!s.enabled}
              aria-label={bandLabel(hz)}
              onChange={e => audioEffects.setBand(i, Number(e.target.value))}
              className="h-32 accent-accent [writing-mode:vertical-lr] [direction:rtl]"
            />
            <span className="text-xs text-text-secondary">{bandLabel(hz)}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-4 pt-2">
        <div>
          <span className="text-sm text-text-secondary">{t('eq.normalization')}</span>
          <p className="text-xs text-text-secondary mt-1">{t('eq.normalizationHint')}</p>
        </div>
        <Switch checked={s.normalization} label={t('eq.normalization')} onToggle={() => audioEffects.update({ normalization: !s.normalization })} />
      </div>
    </div>
  )
}
