import { describe, it, expect, beforeEach } from 'vitest'
import { createPreferences } from './preferences'

const DEFAULTS = { crossfade: 0, theme: 'dark' as 'dark' | 'light', enabled: true }

describe('createPreferences', () => {
  beforeEach(() => localStorage.clear())

  it('starts from defaults and persists updates under prefs:<name>', () => {
    const prefs = createPreferences('test', DEFAULTS)
    expect(prefs.getState().values).toEqual(DEFAULTS)
    prefs.getState().set({ crossfade: 5 })
    expect(prefs.getState().values.crossfade).toBe(5)
    expect(JSON.parse(localStorage.getItem('prefs:test')!)).toEqual({ ...DEFAULTS, crossfade: 5 })
  })

  it('restores saved values, ignoring unknown keys and wrong types', () => {
    localStorage.setItem('prefs:test', JSON.stringify({ crossfade: 3, theme: 42, stale: 'x' }))
    const prefs = createPreferences('test', DEFAULTS)
    expect(prefs.getState().values).toEqual({ ...DEFAULTS, crossfade: 3 })
  })

  it('falls back to defaults on corrupt storage and resets', () => {
    localStorage.setItem('prefs:test', '{nope')
    const prefs = createPreferences('test', DEFAULTS)
    expect(prefs.getState().values).toEqual(DEFAULTS)
    prefs.getState().set({ enabled: false })
    prefs.getState().reset()
    expect(prefs.getState().values).toEqual(DEFAULTS)
    expect(localStorage.getItem('prefs:test')).toBeNull()
  })

  it('treats a non-object payload as empty', () => {
    localStorage.setItem('prefs:test', '[1]')
    expect(createPreferences('test', DEFAULTS).getState().values).toEqual(DEFAULTS)
  })
})
