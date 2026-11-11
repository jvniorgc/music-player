import { t } from '../i18n'
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

/**
 * Maps a keydown to a player action. Plain arrow keys are left alone so they
 * keep scrolling/moving focus in lists; seeking uses Shift+Left/Right.
 */
export function resolveShortcut(e: ShortcutEvent): ShortcutAction | null {
  if (e.altKey || isEditableTarget(e.target)) return null
  const mod = e.ctrlKey || e.metaKey
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key

  if (mod && !e.shiftKey) {
    switch (key) {
      case 'ArrowRight': return 'next'
      case 'ArrowLeft': return 'previous'
      case 'ArrowUp': return 'volumeUp'
      case 'ArrowDown': return 'volumeDown'
      case 'f': return 'search'
    }
    return null
  }
  if (mod) return null
  if (e.shiftKey) {
    if (key === 'ArrowRight') return 'seekForward'
    if (key === 'ArrowLeft') return 'seekBack'
    return null
  }
  if (e.repeat) return null
  if (e.code === 'Space' || key === ' ') return 'togglePlay'
  switch (key) {
    case 'm': return 'mute'
    case 's': return 'shuffle'
    case 'r': return 'repeat'
    case '/': return 'search'
  }
  return null
}

/** Human-readable list for the settings page. */
export function shortcutList(isMac: boolean): { keys: string; action: string }[] {
  const mod = isMac ? '⌘' : 'Ctrl'
  return [
    { keys: t('shortcut.space'), action: t('shortcut.playPause') },
    { keys: `${mod} + →`, action: t('shortcut.next') },
    { keys: `${mod} + ←`, action: t('shortcut.previous') },
    { keys: 'Shift + → / ←', action: t('shortcut.seek', { seconds: SEEK_STEP }) },
    { keys: `${mod} + ↑ / ↓`, action: t('shortcut.volume') },
    { keys: 'M', action: t('shortcut.mute') },
    { keys: 'S', action: t('shortcut.shuffle') },
    { keys: 'R', action: t('shortcut.repeat') },
    { keys: `${mod} + F ${t('shortcut.or')} /`, action: t('shortcut.search') },
    { keys: 'Alt + ← / →', action: t('shortcut.history') },
  ]
}

/** Event SearchView listens to so a shortcut can focus its input. */
export const FOCUS_SEARCH_EVENT = 'app:focus-search'
