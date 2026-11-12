import { globalShortcut } from 'electron'
import type { GlobalShortcutAction } from '@music-player/core/platform'

const ACTIONS: GlobalShortcutAction[] = ['togglePlay', 'next', 'previous', 'volumeUp', 'volumeDown']
let registered: string[] = []

export function clearGlobalShortcuts(): void {
  for (const acc of registered) globalShortcut.unregister(acc)
  registered = []
}

/**
 * Replaces the system-wide shortcuts with `bindings` (action → Electron accelerator);
 * null disables them all. Returns the actions whose combo couldn't be registered.
 */
export function applyGlobalShortcuts(
  bindings: Partial<Record<GlobalShortcutAction, string>> | null,
  send: (action: GlobalShortcutAction) => void,
): { failed: GlobalShortcutAction[] } {
  clearGlobalShortcuts()
  const failed: GlobalShortcutAction[] = []
  if (!bindings || typeof bindings !== 'object') return { failed }
  for (const action of ACTIONS) {
    const acc = bindings[action]
    if (typeof acc !== 'string' || !acc) continue
    let ok = false
    try { ok = globalShortcut.register(acc, () => send(action)) } catch { /* invalid accelerator */ }
    if (ok) registered.push(acc)
    else failed.push(action)
  }
  return { failed }
}
