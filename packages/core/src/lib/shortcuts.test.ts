import { describe, it, expect } from 'vitest'
import {
  isEditableTarget, resolveShortcut, comboFromEvent, formatCombo, findConflict, toAccelerator, effectiveBindings,
  DEFAULT_BINDINGS, type ShortcutEvent,
} from './shortcuts'

const ev = (key: string, over: Partial<ShortcutEvent> = {}): ShortcutEvent => ({
  key, code: key === ' ' ? 'Space' : undefined, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
  target: document.body, ...over,
})

describe('isEditableTarget', () => {
  it('detects text fields and contenteditable', () => {
    const text = document.createElement('input')
    const range = document.createElement('input')
    range.type = 'range'
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    expect(isEditableTarget(text)).toBe(true)
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true)
    expect(isEditableTarget(document.createElement('select'))).toBe(true)
    expect(isEditableTarget(editable)).toBe(true)
    expect(isEditableTarget(range)).toBe(false)
    expect(isEditableTarget(document.createElement('button'))).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
    expect(isEditableTarget(window)).toBe(false)
  })
})

describe('resolveShortcut', () => {
  it.each([
    [ev(' '), 'togglePlay'],
    [ev('ArrowRight', { ctrlKey: true }), 'next'],
    [ev('ArrowLeft', { metaKey: true }), 'previous'],
    [ev('ArrowUp', { ctrlKey: true }), 'volumeUp'],
    [ev('ArrowDown', { ctrlKey: true }), 'volumeDown'],
    [ev('F', { ctrlKey: true }), 'search'],
    [ev('/'), 'search'],
    [ev('ArrowRight', { shiftKey: true }), 'seekForward'],
    [ev('ArrowLeft', { shiftKey: true }), 'seekBack'],
    [ev('M'), 'mute'],
    [ev('s'), 'shuffle'],
    [ev('r'), 'repeat'],
  ] as const)('%j → %s', (e, action) => {
    expect(resolveShortcut(e)).toBe(action)
  })

  it.each([
    ['plain arrows', ev('ArrowRight')],
    ['alt (history nav)', ev('ArrowLeft', { altKey: true })],
    ['unknown mod key', ev('x', { ctrlKey: true })],
    ['mod+shift', ev('ArrowRight', { ctrlKey: true, shiftKey: true })],
    ['shift+letter', ev('S', { shiftKey: true })],
    ['auto-repeat toggle', ev('s', { repeat: true })],
    ['unknown key', ev('q')],
    ['typing in an input', ev(' ', { target: document.createElement('input') })],
  ])('ignores %s', (_label, e) => {
    expect(resolveShortcut(e)).toBeNull()
  })

  it('uses custom bindings when given', () => {
    const b = { ...DEFAULT_BINDINGS, next: ['Alt+N'] }
    expect(resolveShortcut(ev('n', { altKey: true }), b)).toBe('next')
    expect(resolveShortcut(ev('ArrowRight', { ctrlKey: true }), b)).toBeNull()
  })

  it('lets modified combos auto-repeat', () => {
    expect(resolveShortcut(ev('ArrowUp', { ctrlKey: true, repeat: true }))).toBe('volumeUp')
  })
})

describe('combo helpers', () => {
  it('builds a normalized combo from a keydown', () => {
    expect(comboFromEvent(ev(' '))).toBe('Space')
    expect(comboFromEvent(ev('x', { metaKey: true, altKey: true, shiftKey: true }))).toBe('Mod+Alt+Shift+X')
    expect(comboFromEvent(ev('ArrowLeft', { ctrlKey: true }))).toBe('Mod+ArrowLeft')
    expect(comboFromEvent(ev('Shift', { shiftKey: true }))).toBeNull()
    expect(comboFromEvent(ev('Dead'))).toBeNull()
  })

  it('formats combos for display', () => {
    expect(formatCombo('Mod+ArrowRight', true)).toBe('⌘ + →')
    expect(formatCombo('Mod+Alt+Shift+Space', false)).toBe('Ctrl + Alt + Shift + Space')
    expect(formatCombo('Alt+ArrowUp', true)).toBe('⌥ + ↑')
    expect(formatCombo('ArrowDown', false)).toBe('↓')
    expect(formatCombo('Shift+ArrowLeft', true)).toBe('⇧ + ←')
  })

  it('finds conflicting actions and reserved combos', () => {
    expect(findConflict(DEFAULT_BINDINGS, 'next', 'M')).toBe('mute')
    expect(findConflict(DEFAULT_BINDINGS, 'next', 'Mod+ArrowRight')).toBeNull()
    expect(findConflict(DEFAULT_BINDINGS, 'next', 'Alt+ArrowLeft')).toBe('history')
    expect(findConflict(DEFAULT_BINDINGS, 'next', 'Q')).toBeNull()
  })

  it('converts combos to Electron accelerators', () => {
    expect(toAccelerator('Mod+Alt+ArrowRight')).toBe('CommandOrControl+Alt+Right')
    expect(toAccelerator('Shift+Space')).toBe('Shift+Space')
    expect(toAccelerator('Mod+/')).toBe('CommandOrControl+/')
  })

  it('merges overrides over defaults', () => {
    const b = effectiveBindings({ next: 'Alt+N', previous: '' })
    expect(b.next).toEqual(['Alt+N'])
    expect(b.previous).toEqual(DEFAULT_BINDINGS.previous)
    expect(b.search).toEqual(['Mod+F', '/'])
  })
})
