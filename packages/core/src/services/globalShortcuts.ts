import { create } from 'zustand'
import type { GlobalShortcutAction } from '../platform'
import { useGlobalShortcutPrefs, GLOBAL_SHORTCUT_DEFAULTS } from '../stores/prefs/shortcuts'
import { toAccelerator } from '../lib/shortcuts'
import { runPlayerAction } from './playerActions'

export const GLOBAL_ACTIONS = Object.keys(GLOBAL_SHORTCUT_DEFAULTS) as GlobalShortcutAction[]

/** Actions whose system-wide combo couldn't be registered (e.g. taken by another app). */
export const useGlobalShortcutStatus = create<{ failed: GlobalShortcutAction[] }>(() => ({ failed: [] }))

/** Keeps the main-process global shortcuts in sync with the prefs; returns a cleanup. */
export function initGlobalShortcuts(): () => void {
  const api = window.api
  if (!api.setGlobalShortcuts || !api.onGlobalShortcut) return () => {}
  const setGlobal = api.setGlobalShortcuts

  const sync = async (values: ReturnType<typeof useGlobalShortcutPrefs.getState>['values']) => {
    const bindings = values.enabled
      ? Object.fromEntries(GLOBAL_ACTIONS.map(a => [a, toAccelerator(values[a])]))
      : null
    try {
      const { failed } = await setGlobal(bindings)
      useGlobalShortcutStatus.setState({ failed })
    } catch {
      useGlobalShortcutStatus.setState({ failed: [] })
    }
  }

  void sync(useGlobalShortcutPrefs.getState().values)
  const unsub = useGlobalShortcutPrefs.subscribe(s => { void sync(s.values) })
  const off = api.onGlobalShortcut(action => runPlayerAction(action))
  return () => {
    unsub()
    off()
    void setGlobal(null)
  }
}
