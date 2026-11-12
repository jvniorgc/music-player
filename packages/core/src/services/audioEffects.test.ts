import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

class FakeParam { value = 0 }
class FakeNode {
  connections: unknown[] = []
  connect(n: unknown) { this.connections.push(n); return n }
  disconnect() { this.connections = [] }
}
class FakeFilter extends FakeNode {
  type = ''
  frequency = new FakeParam()
  gain = new FakeParam()
  Q = new FakeParam()
}
class FakeGain extends FakeNode { gain = new FakeParam() }
class FakeCompressor extends FakeNode {
  threshold = new FakeParam(); knee = new FakeParam(); ratio = new FakeParam()
  attack = new FakeParam(); release = new FakeParam()
}

const sources: Array<{ el: unknown }> = []
class FakeContext {
  static instances: FakeContext[] = []
  state = 'suspended'
  destination = new FakeNode()
  resume = vi.fn(() => { this.state = 'running'; return Promise.resolve() })
  constructor() { FakeContext.instances.push(this) }
  createBiquadFilter() { return new FakeFilter() }
  createGain() { return new FakeGain() }
  createDynamicsCompressor() { return new FakeCompressor() }
  createMediaElementSource(el: unknown) {
    if (sources.some(s => s.el === el)) throw new Error('already connected')
    const s = Object.assign(new FakeNode(), { el })
    sources.push(s)
    return s
  }
}

type Mod = typeof import('./audioEffects')
let mod: Mod

async function load(withContext = true) {
  vi.resetModules()
  if (withContext) vi.stubGlobal('AudioContext', FakeContext)
  else vi.stubGlobal('AudioContext', undefined)
  mod = await import('./audioEffects')
}

const el = () => ({ crossOrigin: null as string | null }) as unknown as HTMLAudioElement
const ctx = () => FakeContext.instances[FakeContext.instances.length - 1]
const graph = () => (mod.audioEffects as any).graph as { preamp: FakeGain; filters: FakeFilter[]; compressor: FakeCompressor }
const trackGain = (a: HTMLAudioElement) => ((mod.audioEffects as any).nodes.get(a) as { gain: FakeGain }).gain.gain.value

beforeEach(async () => {
  localStorage.clear()
  FakeContext.instances = []
  sources.length = 0
  await load()
})
afterEach(() => vi.unstubAllGlobals())

describe('settings', () => {
  it('defaults to a disabled flat EQ with normalization off', () => {
    expect(mod.audioEffects.settings).toEqual({ enabled: false, preset: 'flat', preamp: 0, gains: Array(10).fill(0), normalization: false })
    expect(mod.EQ_BANDS).toHaveLength(10)
  })

  it('persists and reloads settings, sanitizing bad values', async () => {
    mod.audioEffects.update({ enabled: true, preamp: 3 })
    await load()
    expect(mod.audioEffects.settings.enabled).toBe(true)
    expect(mod.audioEffects.settings.preamp).toBe(3)
    localStorage.setItem(mod.EFFECTS_STORAGE_KEY, JSON.stringify({ preset: 'nope', gains: [99, 'x'], preamp: -50 }))
    await load()
    const s = mod.audioEffects.settings
    expect(s.preset).toBe('flat')
    expect(s.gains[0]).toBe(12)
    expect(s.gains[1]).toBe(0)
    expect(s.preamp).toBe(-12)
    localStorage.setItem(mod.EFFECTS_STORAGE_KEY, '{bad json')
    await load()
    expect(mod.audioEffects.settings.preset).toBe('flat')
  })

  it('applying a preset copies its gains; editing a band switches to custom', () => {
    mod.audioEffects.setPreset('bassBoost')
    expect(mod.audioEffects.settings.gains).toEqual(mod.EQ_PRESETS.bassBoost)
    mod.audioEffects.setBand(9, 20)
    expect(mod.audioEffects.settings.preset).toBe('custom')
    expect(mod.audioEffects.settings.gains[9]).toBe(12)
    mod.audioEffects.setPreset('custom')
    expect(mod.audioEffects.settings.gains[9]).toBe(12)
  })

  it('notifies subscribers until unsubscribed', () => {
    const fn = vi.fn()
    const off = mod.audioEffects.subscribe(fn)
    mod.audioEffects.update({ normalization: true })
    expect(fn).toHaveBeenCalledWith(expect.objectContaining({ normalization: true }))
    off()
    mod.audioEffects.update({ normalization: false })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('ignores storage write failures', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    expect(() => mod.audioEffects.update({ enabled: true })).not.toThrow()
    vi.mocked(Storage.prototype.setItem).mockRestore()
  })
})

describe('normalizationGain', () => {
  it('converts dB to linear gain, clamped, and is unity when off or missing', () => {
    expect(mod.normalizationGain(-6, true)).toBeCloseTo(0.501, 3)
    expect(mod.normalizationGain(-6, false)).toBe(1)
    expect(mod.normalizationGain(undefined, true)).toBe(1)
    expect(mod.normalizationGain(NaN, true)).toBe(1)
    expect(mod.normalizationGain(40, true)).toBeCloseTo(10 ** (mod.MAX_NORMALIZATION_BOOST_DB / 20))
  })
})

describe('audio graph', () => {
  it('marks elements CORS-anonymous but does not route them while effects are off', () => {
    const a = el()
    mod.audioEffects.register(a)
    expect(a.crossOrigin).toBe('anonymous')
    expect(FakeContext.instances).toHaveLength(0)
  })

  it('routes every registered element through one shared chain once effects turn on', () => {
    const a = el(), b = el()
    mod.audioEffects.register(a)
    mod.audioEffects.register(b)
    mod.audioEffects.setTrackGain(a, -6)
    mod.audioEffects.update({ enabled: true, preamp: -3 })
    expect(FakeContext.instances).toHaveLength(1)
    expect(sources).toHaveLength(2)
    expect(ctx().resume).toHaveBeenCalled()
    const g = graph()
    expect(g.filters).toHaveLength(10)
    expect(g.filters[0].type).toBe('lowshelf')
    expect(g.filters[9].type).toBe('highshelf')
    expect(g.filters[5].type).toBe('peaking')
    expect(g.preamp.gain.value).toBeCloseTo(10 ** (-3 / 20))
    expect(g.compressor.connections).toContain((mod.audioEffects as any).graph.output)
    // Normalization is still off, so per-track gain stays at unity.
    expect(trackGain(a)).toBe(1)
    // Re-registering / re-enabling never calls createMediaElementSource twice.
    mod.audioEffects.register(a)
    mod.audioEffects.update({ normalization: true })
    expect(sources).toHaveLength(2)
    expect(trackGain(a)).toBeCloseTo(0.501, 3)
    expect(trackGain(b)).toBe(1)
  })

  it('applies band gains only when the EQ is enabled', () => {
    mod.audioEffects.register(el())
    mod.audioEffects.update({ normalization: true })
    mod.audioEffects.setPreset('rock')
    expect(graph().filters.map(f => f.gain.value)).toEqual(Array(10).fill(0))
    expect(graph().preamp.gain.value).toBe(1)
    mod.audioEffects.update({ enabled: true })
    expect(graph().filters.map(f => f.gain.value)).toEqual(mod.EQ_PRESETS.rock)
  })

  it('attaches newly registered elements immediately when active and forgets unregistered ones', () => {
    mod.audioEffects.update({ enabled: true })
    const a = el()
    mod.audioEffects.register(a)
    expect(sources).toHaveLength(1)
    mod.audioEffects.setTrackGain(a, -3)
    mod.audioEffects.unregister(a)
    expect((mod.audioEffects as any).nodes.has(a)).toBe(false)
    mod.audioEffects.setTrackGain(el(), 2) // unknown element: no-op
  })

  it('resume() is a no-op before the context exists and resumes a suspended one', () => {
    mod.audioEffects.resume()
    expect(FakeContext.instances).toHaveLength(0)
    mod.audioEffects.update({ enabled: true })
    ctx().state = 'suspended'
    mod.audioEffects.resume()
    expect(ctx().resume).toHaveBeenCalledTimes(2)
  })

  it('degrades gracefully when Web Audio is unavailable or the element cannot be routed', async () => {
    await load(false)
    const a = el()
    mod.audioEffects.register(a)
    mod.audioEffects.update({ enabled: true })
    mod.audioEffects.resume()
    expect((mod.audioEffects as any).graph).toBeNull()

    await load()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const b = el()
    sources.push({ el: b }) // already connected elsewhere -> createMediaElementSource throws
    mod.audioEffects.register(b)
    mod.audioEffects.update({ enabled: true })
    expect((mod.audioEffects as any).nodes.has(b)).toBe(false)
    expect(console.warn).toHaveBeenCalled()
  })
})

describe('output stage', () => {
  it('mono routes through Web Audio and downmixes to one channel', () => {
    const a = el()
    mod.audioEffects.register(a)
    mod.audioEffects.setMono(true)
    expect(sources).toHaveLength(1)
    const out = (mod.audioEffects as any).graph.output
    expect(out.channelCount).toBe(1)
    expect(out.channelCountMode).toBe('explicit')
    expect(graph().compressor.connections).toContain(out)
    expect(out.connections).toContain(ctx().destination)
    mod.audioEffects.setMono(false)
    expect(out.channelCountMode).toBe('max')
  })

  it('applies the sink id to the context when supported, now or on creation', () => {
    mod.audioEffects.setSinkId('usb')
    expect(FakeContext.instances).toHaveLength(0)
    const setSinkId = vi.fn(() => Promise.reject(new Error('x')))
    ;(FakeContext.prototype as any).setSinkId = setSinkId
    mod.audioEffects.register(el())
    mod.audioEffects.update({ enabled: true })
    expect(setSinkId).toHaveBeenCalledWith('usb')
    mod.audioEffects.setSinkId('')
    expect(setSinkId).toHaveBeenLastCalledWith('')
    delete (FakeContext.prototype as any).setSinkId
    mod.audioEffects.setSinkId('x') // unsupported: no-op
  })

  it('notifies element observers about existing, added and removed elements', () => {
    const a = el(), b = el()
    mod.audioEffects.register(a)
    const fn = vi.fn()
    const off = mod.audioEffects.observeElements(fn)
    expect(fn).toHaveBeenCalledWith(a, true)
    mod.audioEffects.register(b)
    mod.audioEffects.unregister(b)
    expect(fn).toHaveBeenCalledWith(b, true)
    expect(fn).toHaveBeenCalledWith(b, false)
    off()
    mod.audioEffects.register(el())
    expect(fn).toHaveBeenCalledTimes(3)
  })
})
