import type { ReactNode } from 'react'
import { useT } from '../../i18n'
import {
  useInterfacePrefs, ACCENT_PRESETS, DEFAULT_ACCENT,
  type Theme, type Density, type LyricsSize, type ReduceMotion,
} from '../../stores/prefs/interface'

const SELECT = 'bg-surface-2 border border-border rounded-sm px-3 py-2 text-sm text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-sm text-text-secondary">{label}</p>
      {children}
    </div>
  )
}

function Select<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: [T, string][]; onChange: (v: T) => void
}) {
  return (
    <Row label={label}>
      <select value={value} onChange={e => onChange(e.target.value as T)} className={SELECT} aria-label={label}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </Row>
  )
}

export function InterfaceSettings() {
  const { t } = useT()
  const values = useInterfacePrefs(s => s.values)
  const set = useInterfacePrefs(s => s.set)

  return (
    <div className="flex flex-col gap-4">
      <Select<Theme> label={t('prefs.ui.theme')} value={values.theme} onChange={theme => set({ theme })} options={[
        ['dark', t('prefs.ui.themeDark')], ['light', t('prefs.ui.themeLight')], ['system', t('prefs.ui.system')],
      ]} />

      <Row label={t('prefs.ui.accent')}>
        <div className="flex items-center gap-2" role="radiogroup" aria-label={t('prefs.ui.accent')}>
          {ACCENT_PRESETS.map((c, i) => (
            <button
              key={c || 'default'}
              role="radio"
              aria-checked={values.accent === c}
              aria-label={t('prefs.ui.accentPreset', { n: i + 1 })}
              onClick={() => set({ accent: c })}
              className={`w-6 h-6 rounded-full border-2 ${values.accent === c ? 'border-text-primary' : 'border-transparent'}`}
              style={{ backgroundColor: c || DEFAULT_ACCENT }}
            />
          ))}
          <input
            type="color"
            aria-label={t('prefs.ui.accentCustom')}
            title={t('prefs.ui.accentCustom')}
            value={values.accent || DEFAULT_ACCENT}
            onChange={e => set({ accent: e.target.value })}
            className="w-7 h-7 bg-transparent cursor-pointer"
          />
        </div>
      </Row>

      <Select<Density> label={t('prefs.ui.density')} value={values.density} onChange={density => set({ density })} options={[
        ['comfortable', t('prefs.ui.densityComfortable')], ['compact', t('prefs.ui.densityCompact')],
      ]} />

      <Row label={t('prefs.ui.artworkBackground')}>
        <button
          role="switch"
          aria-checked={values.artworkBackground}
          aria-label={t('prefs.ui.artworkBackground')}
          onClick={() => set({ artworkBackground: !values.artworkBackground })}
          className={`relative w-10 h-6 shrink-0 rounded-full transition-colors ${values.artworkBackground ? 'bg-accent' : 'bg-white/15'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${values.artworkBackground ? 'translate-x-4' : ''}`} />
        </button>
      </Row>

      <Select<LyricsSize> label={t('prefs.ui.lyricsSize')} value={values.lyricsSize} onChange={lyricsSize => set({ lyricsSize })} options={[
        ['s', t('prefs.ui.sizeS')], ['m', t('prefs.ui.sizeM')], ['l', t('prefs.ui.sizeL')], ['xl', t('prefs.ui.sizeXL')],
      ]} />

      <Select<ReduceMotion> label={t('prefs.ui.reduceMotion')} value={values.reduceMotion} onChange={reduceMotion => set({ reduceMotion })} options={[
        ['system', t('prefs.ui.system')], ['on', t('prefs.ui.on')], ['off', t('prefs.ui.off')],
      ]} />
    </div>
  )
}
