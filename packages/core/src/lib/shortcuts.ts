/** True when the event target is a text field where typing must not trigger shortcuts. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== 'string') return false
  const el = target as HTMLElement
  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = ((el as HTMLInputElement).type || 'text').toLowerCase()
    // Range sliders / checkboxes / buttons don't take text input.
    return !['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file'].includes(type)
  }
  return el.isContentEditable || el.getAttribute?.('contenteditable') === 'true'
}

export type ShortcutAction =
  | 'togglePlay' | 'next' | 'previous' | 'seekForward' | 'seekBack'
  | 'volumeUp' | 'volumeDown' | 'mute' | 'shuffle' | 'repeat' | 'search'

export interface ShortcutEvent {
  key: string
  code?: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
  repeat?: boolean
  target: EventTarget | null
}

/** Seconds skipped by Shift+Left/Right. */
export const SEEK_STEP = 10
/** Volume change for Ctrl/Cmd+Up/Down. */
export const VOLUME_STEP = 0.1

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  'togglePlay', 'next', 'previous', 'seekForward', 'seekBack',
  'volumeUp', 'volumeDown', 'mute', 'shuffle', 'repeat', 'search',
]

/** Combos are `[Mod+][Alt+][Shift+]Key` (Mod = Ctrl, or ⌘ on macOS). */
export type Bindings = Record<ShortcutAction, string[]>

export const DEFAULT_BINDINGS: Bindings = {
  togglePlay: ['Space'],
  next: ['Mod+ArrowRight'],
  previous: ['Mod+ArrowLeft'],
  seekForward: ['Shift+ArrowRight'],
  seekBack: ['Shift+ArrowLeft'],
  volumeUp: ['Mod+ArrowUp'],
  volumeDown: ['Mod+ArrowDown'],
  mute: ['M'],
  shuffle: ['S'],
  repeat: ['R'],
  search: ['Mod+F', '/'],
}

/** Combos handled elsewhere (Alt+←/→ = history navigation). */
const RESERVED = ['Alt+ArrowLeft', 'Alt+ArrowRight']

/** Applies per-action overrides ('' = default) on top of DEFAULT_BINDINGS. */
export function effectiveBindings(overrides: Partial<Record<ShortcutAction, string>>): Bindings {
  const out = { ...DEFAULT_BINDINGS }
  for (const a of SHORTCUT_ACTIONS) if (overrides[a]) out[a] = [overrides[a]!]
  return out
}

/** Normalized combo for a keydown, or null for lone modifier / dead keys. */
export function comboFromEvent(e: ShortcutEvent): string | null {
  if (['Control', 'Meta', 'Shift', 'Alt', 'AltGraph', 'Dead', 'Unidentified'].includes(e.key)) return null
  const key = e.code === 'Space' || e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('Mod')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  parts.push(key)
  return parts.join('+')
}

/**
 * Maps a keydown to a player action. Plain arrow keys are left alone so they
 * keep scrolling/moving focus in lists; seeking uses Shift+Left/Right.
 */
export function resolveShortcut(e: ShortcutEvent, bindings: Bindings = DEFAULT_BINDINGS): ShortcutAction | null {
  if (isEditableTarget(e.target)) return null
  const combo = comboFromEvent(e)
  if (!combo) return null
  // Single-key toggles shouldn't fire repeatedly while held.
  if (e.repeat && !combo.includes('+')) return null
  return SHORTCUT_ACTIONS.find(a => bindings[a].includes(combo)) ?? null
}

/** The action (or 'history' for reserved combos) already using `combo`, other than `action`. */
export function findConflict(bindings: Bindings, action: string, combo: string): ShortcutAction | 'history' | null {
  if (RESERVED.includes(combo)) return 'history'
  return SHORTCUT_ACTIONS.find(a => a !== action && bindings[a].includes(combo)) ?? null
}

const ARROWS: Record<string, string> = { ArrowRight: '→', ArrowLeft: '←', ArrowUp: '↑', ArrowDown: '↓' }

/** Human-readable combo, e.g. "⌘ + →" / "Ctrl + Alt + Space". */
export function formatCombo(combo: string, isMac: boolean): string {
  const names: Record<string, string> = isMac
    ? { Mod: '⌘', Alt: '⌥', Shift: '⇧' }
    : { Mod: 'Ctrl', Alt: 'Alt', Shift: 'Shift' }
  return combo.split(/\+(?!$)/).map(p => names[p] ?? ARROWS[p] ?? p).join(' + ')
}

/** Electron accelerator for a combo (used for global shortcuts). */
export function toAccelerator(combo: string): string {
  return combo.split(/\+(?!$)/).map(p => p === 'Mod' ? 'CommandOrControl' : p.replace(/^Arrow/, '')).join('+')
}

/** Event SearchView listens to so a shortcut can focus its input. */
export const FOCUS_SEARCH_EVENT = 'app:focus-search'
