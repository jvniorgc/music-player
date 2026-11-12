import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

type Mod = typeof import('./audioOutput')
type Prefs = typeof import('../stores/prefs/audio')
type Fx = typeof import('./audioEffects')
let mod: Mod, prefs: Prefs, fx: Fx

let devices: Array<{ kind: string; deviceId: string; label: string }>
let changeListener: (() => void) | null
const mediaDevices = () => ({
  enumerateDevices: vi.fn(async () => devices),
  addEventListener: vi.fn((_: string, fn: () => void) => { changeListener = fn }),
})

async function load(md: unknown = mediaDevices()) {
  vi.resetModules()
  vi.stubGlobal('navigator', { ...navigator, mediaDevices: md })
  prefs = await import('../stores/prefs/audio')
  fx = await import('./audioEffects')
  mod = await import('./audioOutput')
}

const el = (withSink = true) => {
  const a = { volume: 1, crossOrigin: null } as unknown as HTMLAudioElement & { setSinkId?: ReturnType<typeof vi.fn> }
  if (withSink) a.setSinkId = vi.fn(() => Promise.resolve())
  return a
}
const flush = () => new Promise(r => setTimeout(r, 0))

beforeEach(async () => {
  localStorage.clear()
  devices = [
    { kind: 'audioinput', deviceId: 'mic', label: 'Mic' },
    { kind: 'audiooutput', deviceId: 'default', label: '' },
    { kind: 'audiooutput', deviceId: 'usb', label: 'USB DAC' },
  ]
  changeListener = null
  await load()
  await flush()
})
afterEach(() => vi.unstubAllGlobals())

describe('audio prefs', () => {
  it('defaults preserve current behavior', () => {
    expect(prefs.useAudioPrefs.getState().values).toEqual({ deviceId: '', maxVolume: 100, mono: false, volumeStep: 10 })
  })
})

describe('devices', () => {
  it('lists only audio outputs and degrades without the API', async () => {
    expect((await mod.audioOutput.listDevices()).map(d => d.deviceId)).toEqual(['default', 'usb'])
    await load(null)
    expect(await mod.audioOutput.listDevices()).toEqual([])
    await load({ enumerateDevices: () => Promise.reject(new Error('denied')) })
    expect(await mod.audioOutput.listDevices()).toEqual([])
  })

  it('applies the chosen device to registered elements and the Web Audio context', async () => {
    const sinkSpy = vi.spyOn(fx.audioEffects, 'setSinkId')
    const a = el(), noSink = el(false)
    fx.audioEffects.register(a)
    fx.audioEffects.register(noSink)
    expect(a.setSinkId).not.toHaveBeenCalled()
    prefs.useAudioPrefs.getState().set({ deviceId: 'usb' })
    expect(a.setSinkId).toHaveBeenCalledWith('usb')
    expect(sinkSpy).toHaveBeenCalledWith('usb')
    // Newly registered elements pick up the current device.
    const b = el()
    fx.audioEffects.register(b)
    expect(b.setSinkId).toHaveBeenCalledWith('usb')
    // Same target again: no redundant calls.
    prefs.useAudioPrefs.getState().set({ maxVolume: 90 })
    expect(a.setSinkId).toHaveBeenCalledTimes(1)
    fx.audioEffects.unregister(b)
    prefs.useAudioPrefs.getState().set({ deviceId: '' })
    expect(b.setSinkId).toHaveBeenCalledTimes(1)
    expect(a.setSinkId).toHaveBeenLastCalledWith('')
  })

  it('falls back to the default device when the chosen one disappears, and returns when it is back', async () => {
    const a = el()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    a.setSinkId!.mockReturnValueOnce(Promise.reject(new Error('gone')))
    fx.audioEffects.register(a)
    prefs.useAudioPrefs.getState().set({ deviceId: 'usb' })
    devices = devices.filter(d => d.deviceId !== 'usb')
    changeListener!()
    await flush()
    expect(a.setSinkId).toHaveBeenLastCalledWith('')
    expect(prefs.useAudioPrefs.getState().values.deviceId).toBe('usb')
    devices.push({ kind: 'audiooutput', deviceId: 'usb', label: 'USB DAC' })
    changeListener!()
    await flush()
    expect(a.setSinkId).toHaveBeenLastCalledWith('usb')
  })
})

describe('volume limit', () => {
  it('caps the effective volume and rescales live elements when the limit changes', () => {
    expect(mod.audioOutput.effectiveVolume(0.8)).toBe(0.8)
    const a = el()
    fx.audioEffects.register(a)
    a.volume = 0.8
    prefs.useAudioPrefs.getState().set({ maxVolume: 50 })
    expect(mod.audioOutput.effectiveVolume(0.8)).toBeCloseTo(0.4)
    expect(a.volume).toBeCloseTo(0.4)
    prefs.useAudioPrefs.getState().set({ maxVolume: 100 })
    expect(a.volume).toBeCloseTo(0.8)
  })
})

describe('mono', () => {
  it('forwards the mono toggle to the effects chain', () => {
    const spy = vi.spyOn(fx.audioEffects, 'setMono')
    prefs.useAudioPrefs.getState().set({ mono: true })
    expect(spy).toHaveBeenCalledWith(true)
  })
})
