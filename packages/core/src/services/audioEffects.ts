/**
 * Equalizer + loudness normalization over the Web Audio API.
 *
 * Every <audio> element the playback engine creates is registered here. Once
 * any effect is active, each element is routed (once — createMediaElementSource
 * can only be called a single time per element) through:
 *
 *   source -> per-track gain (normalization) -> preamp -> 10 biquads -> limiter -> destination
 *
 * The chain after the per-track gain is shared, so gapless element swaps keep
 * the same EQ. Elements are not routed while effects are off, so playback never
 * depends on Web Audio unless the user opts in. Elements are flagged
 * crossOrigin="anonymous" up front: the main process adds CORS headers to the
 * Jellyfin server and local-audio:// responses, otherwise routed media would be
 * silenced as cross-origin.
 */

export const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const
export const EQ_MAX_DB = 12
export const MAX_NORMALIZATION_BOOST_DB = 6
const MIN_NORMALIZATION_DB = -24
export const EFFECTS_STORAGE_KEY = 'player_audio_effects'

export const EQ_PRESETS = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bassBoost: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  trebleBoost: [0, 0, 0, 0, 0, 0, 2, 4, 5, 6],
  vocal: [-2, -2, -1, 1, 3, 4, 3, 1, 0, -1],
  rock: [5, 3, 1, -1, -2, 0, 2, 3, 4, 4],
  pop: [-1, 1, 3, 4, 3, 0, -1, -1, 1, 2],
  electronic: [5, 4, 1, 0, -2, 1, 0, 2, 4, 5],
  acoustic: [3, 3, 2, 1, 1, 1, 2, 3, 2, 1],
} satisfies Record<string, number[]>

export type EqPresetName = keyof typeof EQ_PRESETS
export type EqPreset = EqPresetName | 'custom'
export const EQ_PRESET_NAMES = [...Object.keys(EQ_PRESETS), 'custom'] as EqPreset[]

export interface AudioEffectsSettings {
  enabled: boolean
  preset: EqPreset
  /** dB, applied before the EQ bands. */
  preamp: number
  /** dB per band, aligned with EQ_BANDS. */
  gains: number[]
  normalization: boolean
}

const clampDb = (v: unknown) => typeof v === 'number' && isFinite(v) ? Math.max(-EQ_MAX_DB, Math.min(EQ_MAX_DB, v)) : 0
const dbToLinear = (db: number) => 10 ** (db / 20)

function defaults(): AudioEffectsSettings {
  return { enabled: false, preset: 'flat', preamp: 0, gains: [...EQ_PRESETS.flat], normalization: false }
}

function loadSettings(): AudioEffectsSettings {
  const base = defaults()
  try {
    const raw = JSON.parse(localStorage.getItem(EFFECTS_STORAGE_KEY) ?? '{}') as Partial<AudioEffectsSettings>
    return {
      enabled: raw.enabled === true,
      preset: EQ_PRESET_NAMES.includes(raw.preset as EqPreset) ? raw.preset as EqPreset : base.preset,
      preamp: clampDb(raw.preamp),
      gains: EQ_BANDS.map((_, i) => clampDb(Array.isArray(raw.gains) ? raw.gains[i] : 0)),
      normalization: raw.normalization === true,
    }
  } catch {
    return base
  }
}

/** Linear gain for a track's Jellyfin NormalizationGain (dB), clamped to limit clipping. */
export function normalizationGain(db: number | undefined, enabled: boolean): number {
  if (!enabled || typeof db !== 'number' || !isFinite(db)) return 1
  return dbToLinear(Math.max(MIN_NORMALIZATION_DB, Math.min(MAX_NORMALIZATION_BOOST_DB, db)))
}

interface Graph {
  ctx: AudioContext
  preamp: GainNode
  filters: BiquadFilterNode[]
  compressor: DynamicsCompressorNode
}

type Listener = (s: AudioEffectsSettings) => void

class AudioEffects {
  private _settings = loadSettings()
  private listeners = new Set<Listener>()
  private graph: Graph | null = null
  private unsupported = false
  private elements = new Set<HTMLAudioElement>()
  private trackGains = new Map<HTMLAudioElement, number | undefined>()
  private nodes = new Map<HTMLAudioElement, { source: MediaElementAudioSourceNode; gain: GainNode }>()
  private failed = new WeakSet<HTMLAudioElement>()

  get settings(): AudioEffectsSettings { return this._settings }

  private get active() { return this._settings.enabled || this._settings.normalization }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  update(patch: Partial<AudioEffectsSettings>) {
    this._settings = { ...this._settings, ...patch }
    try { localStorage.setItem(EFFECTS_STORAGE_KEY, JSON.stringify(this._settings)) } catch { /* storage unavailable */ }
    this.apply()
    this.listeners.forEach(fn => fn(this._settings))
  }

  setPreset(preset: EqPreset) {
    if (preset === 'custom') this.update({ preset })
    else this.update({ preset, gains: [...EQ_PRESETS[preset]] })
  }

  setBand(index: number, db: number) {
    const gains = [...this._settings.gains]
    gains[index] = clampDb(db)
    this.update({ gains, preset: 'custom' })
  }

  register(audio: HTMLAudioElement) {
    audio.crossOrigin = 'anonymous'
    this.elements.add(audio)
    if (this.active) this.apply()
  }

  unregister(audio: HTMLAudioElement) {
    this.elements.delete(audio)
    this.trackGains.delete(audio)
    this.nodes.get(audio)?.gain.disconnect()
    this.nodes.delete(audio)
  }

  /** Sets the Jellyfin NormalizationGain (dB) of the track loaded in `audio`. */
  setTrackGain(audio: HTMLAudioElement, db: number | undefined) {
    if (!this.elements.has(audio)) return
    this.trackGains.set(audio, db)
    this.applyTrackGain(audio)
  }

  /** Resumes a suspended AudioContext (call from play). */
  resume() {
    const ctx = this.graph?.ctx
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})
  }

  private ensureGraph(): Graph | null {
    if (this.graph || this.unsupported) return this.graph
    const Ctx = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext
    if (!Ctx) {
      this.unsupported = true
      return null
    }
    const ctx = new Ctx()
    const preamp = ctx.createGain()
    const filters = EQ_BANDS.map((freq, i) => {
      const f = ctx.createBiquadFilter()
      f.type = i === 0 ? 'lowshelf' : i === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking'
      f.frequency.value = freq
      f.Q.value = 1.41
      return f
    })
    // Brick-wall-ish limiter: transparent at normal levels, catches EQ/normalization boosts.
    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -1
    compressor.knee.value = 0
    compressor.ratio.value = 20
    compressor.attack.value = 0.003
    compressor.release.value = 0.25
    let node: AudioNode = preamp
    for (const f of filters) node = node.connect(f)
    node.connect(compressor)
    compressor.connect(ctx.destination)
    this.graph = { ctx, preamp, filters, compressor }
    return this.graph
  }

  private apply() {
    if (!this.active && !this.graph) return
    const graph = this.ensureGraph()
    if (!graph) return
    const { enabled, preamp, gains } = this._settings
    graph.preamp.gain.value = enabled ? dbToLinear(preamp) : 1
    graph.filters.forEach((f, i) => { f.gain.value = enabled ? gains[i] : 0 })
    for (const audio of this.elements) {
      if (!this.nodes.has(audio) && !this.failed.has(audio)) this.attach(graph, audio)
      this.applyTrackGain(audio)
    }
    this.resume()
  }

  private attach(graph: Graph, audio: HTMLAudioElement) {
    try {
      const source = graph.ctx.createMediaElementSource(audio)
      const gain = graph.ctx.createGain()
      source.connect(gain)
      gain.connect(graph.preamp)
      this.nodes.set(audio, { source, gain })
    } catch (err) {
      this.failed.add(audio)
      console.warn('[AudioEffects] Could not route audio element:', err)
    }
  }

  private applyTrackGain(audio: HTMLAudioElement) {
    const n = this.nodes.get(audio)
    if (n) n.gain.gain.value = normalizationGain(this.trackGains.get(audio), this._settings.normalization)
  }
}

export const audioEffects = new AudioEffects()
