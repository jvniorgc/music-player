import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useInterfacePrefs, applyInterfacePrefs, initInterfacePrefs, hoverColor, LYRICS_SIZE_CLASS } from './interface'

type Listener = (e: { matches: boolean }) => void
function mockMedia(dark: boolean, reduce: boolean) {
  const listeners: Record<string, Listener[]> = {}
  const state: Record<string, boolean> = { '(prefers-color-scheme: dark)': dark, '(prefers-reduced-motion: reduce)': reduce }
  window.matchMedia = vi.fn((q: string) => ({
    get matches() { return state[q] },
    addEventListener: (_: string, l: Listener) => { (listeners[q] ??= []).push(l) },
    removeEventListener: (_: string, l: Listener) => { listeners[q] = listeners[q].filter(x => x !== l) },
  })) as unknown as typeof window.matchMedia
  return (q: string, v: boolean) => { state[q] = v; listeners[q]?.forEach(l => l({ matches: v })) }
}

const html = document.documentElement

describe('interface prefs', () => {
  beforeEach(() => {
    useInterfacePrefs.getState().reset()
    html.removeAttribute('data-theme'); html.removeAttribute('data-density'); html.removeAttribute('data-reduce-motion')
    html.style.cssText = ''
  })

  it('defaults preserve the current look', () => {
    mockMedia(false, false)
    expect(useInterfacePrefs.getState().values).toEqual({
      theme: 'dark', accent: '', density: 'comfortable', artworkBackground: true, lyricsSize: 'm', reduceMotion: 'system',
    })
    applyInterfacePrefs(useInterfacePrefs.getState().values)
    expect(html.dataset.theme).toBe('dark')
    expect(html.dataset.density).toBe('comfortable')
    expect(html.hasAttribute('data-reduce-motion')).toBe(false)
    expect(html.style.getPropertyValue('--color-accent')).toBe('')
    expect(LYRICS_SIZE_CLASS.m).toBe('text-2xl')
  })

  it('applies light theme, accent, compact density and reduce motion', () => {
    mockMedia(true, false)
    applyInterfacePrefs({ ...useInterfacePrefs.getState().values, theme: 'light', accent: '#0a84ff', density: 'compact', reduceMotion: 'on' })
    expect(html.dataset.theme).toBe('light')
    expect(html.dataset.density).toBe('compact')
    expect(html.hasAttribute('data-reduce-motion')).toBe(true)
    expect(html.style.getPropertyValue('--color-accent')).toBe('#0a84ff')
    expect(html.style.getPropertyValue('--color-accent-hover')).toBe(hoverColor('#0a84ff'))
    applyInterfacePrefs({ ...useInterfacePrefs.getState().values, reduceMotion: 'off' })
    expect(html.hasAttribute('data-reduce-motion')).toBe(false)
    expect(html.style.getPropertyValue('--color-accent')).toBe('')
  })

  it('lightens accent for hover and ignores invalid colors', () => {
    expect(hoverColor('#000000')).toBe('#262626')
    expect(hoverColor('#ffffff')).toBe('#ffffff')
    expect(hoverColor('nope')).toBe('nope')
  })

  it('follows the system theme and motion live, and reacts to pref changes', () => {
    const emit = mockMedia(false, true)
    useInterfacePrefs.getState().set({ theme: 'system' })
    const cleanup = initInterfacePrefs()
    expect(html.dataset.theme).toBe('light')
    expect(html.hasAttribute('data-reduce-motion')).toBe(true)
    emit('(prefers-color-scheme: dark)', true)
    expect(html.dataset.theme).toBe('dark')
    emit('(prefers-reduced-motion: reduce)', false)
    expect(html.hasAttribute('data-reduce-motion')).toBe(false)
    useInterfacePrefs.getState().set({ density: 'compact' })
    expect(html.dataset.density).toBe('compact')
    cleanup()
    useInterfacePrefs.getState().set({ density: 'comfortable' })
    expect(html.dataset.density).toBe('compact')
  })
})
