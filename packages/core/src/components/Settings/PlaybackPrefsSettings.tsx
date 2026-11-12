import { useShallow } from 'zustand/react/shallow'
import { useT } from '../../i18n'
import type { Messages } from '../../i18n/en'
import {
  CROSSFADE_MAX, PREVIOUS_THRESHOLDS, usePlaybackPrefs, type QueueEndBehavior, type SongClickBehavior,
} from '../../stores/prefs/playback'

const QUEUE_END: QueueEndBehavior[] = ['stop', 'repeat', 'radio']
const SONG_CLICK: SongClickBehavior[] = ['replace', 'next', 'end']

const selectClass = 'bg-surface-2 border border-border rounded-sm px-3 py-2 text-sm text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="text-text-secondary">{label}</span>
      {children}
    </div>
  )
}

export function PlaybackPrefsSettings() {
  const { t } = useT()
  const [prefs, set] = usePlaybackPrefs(useShallow(s => [s.values, s.set] as const))
  const seconds = (value: number) => t('prefs.playback.seconds', { value })

  return (
    <div className="space-y-2">
      <div className="py-2 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="text-text-secondary">{t('prefs.playback.crossfade')}</span>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={CROSSFADE_MAX}
              step={1}
              value={prefs.crossfade}
              onChange={e => set({ crossfade: Number(e.target.value) })}
              aria-label={t('prefs.playback.crossfade')}
              className="w-40 accent-accent"
            />
            <span className="w-14 text-right tabular-nums text-text-secondary">
              {prefs.crossfade === 0 ? t('prefs.playback.crossfadeOff') : seconds(prefs.crossfade)}
            </span>
          </div>
        </div>
        <p className="text-xs text-text-secondary mt-1">{t('prefs.playback.crossfadeHint')}</p>
      </div>

      <Row label={t('prefs.playback.gapless')}>
        <button
          role="switch"
          aria-checked={prefs.gapless}
          aria-label={t('prefs.playback.gapless')}
          onClick={() => set({ gapless: !prefs.gapless })}
          className={`relative w-10 h-6 shrink-0 rounded-full transition-colors ${prefs.gapless ? 'bg-accent' : 'bg-white/15'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${prefs.gapless ? 'translate-x-4' : ''}`} />
        </button>
      </Row>

      <Row label={t('prefs.playback.previousThreshold')}>
        <select
          value={String(prefs.previousThreshold)}
          onChange={e => set({ previousThreshold: Number(e.target.value) })}
          aria-label={t('prefs.playback.previousThreshold')}
          className={selectClass}
        >
          {PREVIOUS_THRESHOLDS.map(n => (
            <option key={n} value={n}>{n === 0 ? t('prefs.playback.previousAlways') : seconds(n)}</option>
          ))}
        </select>
      </Row>

      <Row label={t('prefs.playback.queueEnd')}>
        <select
          value={prefs.queueEnd}
          onChange={e => set({ queueEnd: e.target.value as QueueEndBehavior })}
          aria-label={t('prefs.playback.queueEnd')}
          className={selectClass}
        >
          {QUEUE_END.map(v => <option key={v} value={v}>{t(`prefs.playback.queueEnd.${v}` as keyof Messages)}</option>)}
        </select>
      </Row>

      <Row label={t('prefs.playback.songClick')}>
        <select
          value={prefs.songClick}
          onChange={e => set({ songClick: e.target.value as SongClickBehavior })}
          aria-label={t('prefs.playback.songClick')}
          className={selectClass}
        >
          {SONG_CLICK.map(v => <option key={v} value={v}>{t(`prefs.playback.songClick.${v}` as keyof Messages)}</option>)}
        </select>
      </Row>
    </div>
  )
}
