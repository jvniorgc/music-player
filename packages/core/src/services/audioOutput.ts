/**
 * Output device, volume limit and mono preferences. Observes the elements the
 * playback engine registers with audioEffects, so the engine only needs to run
 * volumes through effectiveVolume().
 */
import { useAudioPrefs } from '../stores/prefs/audio'
import { audioEffects } from './audioEffects'

type SinkElement = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }

const prefs = () => useAudioPrefs.getState().values
const mediaDevices = () => (globalThis.navigator as Navigator | undefined)?.mediaDevices

class AudioOutput {
  private elements = new Set<SinkElement>()
  private available: Set<string> | null = null
  private sinkId = ''
  private maxVolume = prefs().maxVolume

  constructor() {
    audioEffects.observeElements((audio, added) => {
      if (!added) { this.elements.delete(audio); return }
      this.elements.add(audio)
      if (this.sinkId) this.applySink(audio, this.sinkId)
    })
    useAudioPrefs.subscribe(() => this.sync())
    mediaDevices()?.addEventListener?.('devicechange', () => { void this.refresh() })
    audioEffects.setMono(prefs().mono)
    void this.refresh()
  }

  /** The volume to set on an element for a user-facing volume of `v` (0–1). */
  effectiveVolume(v: number): number {
    return v * prefs().maxVolume / 100
  }

  async listDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const all = await mediaDevices()?.enumerateDevices?.()
      return (all ?? []).filter(d => d.kind === 'audiooutput')
    } catch {
      return []
    }
  }

  private async refresh() {
    this.available = new Set((await this.listDevices()).map(d => d.deviceId))
    this.sync()
  }

  private sync() {
    const { deviceId, maxVolume, mono } = prefs()
    audioEffects.setMono(mono)
    if (maxVolume !== this.maxVolume) {
      const ratio = maxVolume / this.maxVolume
      this.maxVolume = maxVolume
      for (const a of this.elements) a.volume = Math.max(0, Math.min(1, a.volume * ratio))
    }
    const target = deviceId && (!this.available || this.available.has(deviceId)) ? deviceId : ''
    if (target === this.sinkId) return
    this.sinkId = target
    for (const a of this.elements) this.applySink(a, target)
    audioEffects.setSinkId(target)
  }

  private applySink(audio: SinkElement, id: string) {
    audio.setSinkId?.(id).catch(err => console.warn('[AudioOutput] setSinkId failed:', err))
  }
}

export const audioOutput = new AudioOutput()
