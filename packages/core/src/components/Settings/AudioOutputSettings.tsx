import { useEffect, useState } from 'react'
import { useAudioPrefs } from '../../stores/prefs/audio'
import { audioOutput } from '../../services/audioOutput'
import { useT } from '../../i18n'

const VOLUME_STEPS = [2, 5, 10]
const selectClass = 'bg-surface-2 border border-border rounded-sm px-3 py-2 text-sm text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'

function useOutputDevices() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  useEffect(() => {
    let alive = true
    const load = () => { audioOutput.listDevices().then(d => { if (alive) setDevices(d) }) }
    load()
    const md = globalThis.navigator?.mediaDevices
    md?.addEventListener?.('devicechange', load)
    return () => { alive = false; md?.removeEventListener?.('devicechange', load) }
  }, [])
  // The "default"/"communications" pseudo-devices are covered by the system-default option.
  return devices.filter(d => d.deviceId !== 'default' && d.deviceId !== 'communications')
}

export function AudioOutputSettings() {
  const { t } = useT()
  const v = useAudioPrefs(s => s.values)
  const set = useAudioPrefs(s => s.set)
  const devices = useOutputDevices()
  const sinkSupported = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-text-secondary">{t('prefs.audio.device')}</span>
        <select
          value={v.deviceId}
          onChange={e => set({ deviceId: e.target.value })}
          aria-label={t('prefs.audio.device')}
          className={`${selectClass} max-w-64`}
        >
          <option value="">{t('prefs.audio.deviceDefault')}</option>
          {devices.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label || t('prefs.audio.deviceUnnamed', { n: i + 1 })}</option>
          ))}
        </select>
      </div>
      {!sinkSupported && <p className="text-xs text-text-secondary">{t('prefs.audio.deviceUnsupported')}</p>}

      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-text-secondary">{t('prefs.audio.maxVolume')}</span>
        <div className="flex items-center gap-3">
          <input
            type="range" min={50} max={100} step={5}
            value={v.maxVolume}
            onChange={e => set({ maxVolume: Number(e.target.value) })}
            aria-label={t('prefs.audio.maxVolume')}
            className="w-40 accent-accent"
          />
          <span className="w-10 text-right text-xs text-text-secondary tabular-nums">{t('prefs.audio.percent', { value: v.maxVolume })}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-text-secondary">{t('prefs.audio.mono')}</p>
          <p className="text-xs text-text-secondary/70">{t('prefs.audio.monoHint')}</p>
        </div>
        <button
          role="switch"
          aria-checked={v.mono}
          aria-label={t('prefs.audio.mono')}
          onClick={() => set({ mono: !v.mono })}
          className={`relative w-10 h-6 shrink-0 rounded-full transition-colors ${v.mono ? 'bg-accent' : 'bg-white/15'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${v.mono ? 'translate-x-4' : ''}`} />
        </button>
      </div>

      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-text-secondary">{t('prefs.audio.volumeStep')}</span>
        <select
          value={v.volumeStep}
          onChange={e => set({ volumeStep: Number(e.target.value) })}
          aria-label={t('prefs.audio.volumeStep')}
          className={selectClass}
        >
          {VOLUME_STEPS.map(s => <option key={s} value={s}>{t('prefs.audio.percent', { value: s })}</option>)}
        </select>
      </div>
    </div>
  )
}
