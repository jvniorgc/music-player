import { create } from 'zustand'

type Primitive = string | number | boolean

export interface PreferencesState<T extends Record<string, Primitive>> {
  values: T
  set: (patch: Partial<T>) => void
  reset: () => void
}

/**
 * A typed, localStorage-backed Zustand store for one group of user preferences
 * (saved under `prefs:<name>`). Saved values whose type differs from the default
 * are dropped, so adding/changing keys never breaks old installs.
 *
 * Use in React via `usePrefs(s => s.values.key)`; outside React via `usePrefs.getState()`
 * and `usePrefs.subscribe(...)`.
 */
export function createPreferences<T extends Record<string, Primitive>>(name: string, defaults: T) {
  const key = `prefs:${name}`

  const load = (): T => {
    let saved: unknown
    try { saved = JSON.parse(localStorage.getItem(key) ?? '{}') } catch { saved = {} }
    const values = { ...defaults }
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      for (const k of Object.keys(defaults) as (keyof T)[]) {
        const v = (saved as Record<string, unknown>)[k as string]
        if (typeof v === typeof defaults[k]) values[k] = v as T[keyof T]
      }
    }
    return values
  }

  return create<PreferencesState<T>>((setState, getState) => ({
    values: load(),
    set: (patch) => {
      const values = { ...getState().values, ...patch }
      try { localStorage.setItem(key, JSON.stringify(values)) } catch { /* storage full/unavailable */ }
      setState({ values })
    },
    reset: () => {
      try { localStorage.removeItem(key) } catch { /* ignore */ }
      setState({ values: { ...defaults } })
    },
  }))
}
