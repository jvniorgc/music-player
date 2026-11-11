import { describe, it, expect } from 'vitest'
import { isEditableTarget, resolveShortcut, shortcutList, type ShortcutEvent } from './shortcuts'

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

  it('lists shortcuts with the platform modifier', () => {
    expect(shortcutList(true).some(s => s.keys.includes('⌘'))).toBe(true)
    expect(shortcutList(false).some(s => s.keys.includes('Ctrl'))).toBe(true)
  })
})
