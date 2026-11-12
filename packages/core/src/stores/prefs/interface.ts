import { createPreferences } from '../../lib/preferences'

export type Theme = 'dark' | 'light' | 'system'
export type Density = 'comfortable' | 'compact'
export type LyricsSize = 's' | 'm' | 'l' | 'xl'
export type ReduceMotion = 'system' | 'on' | 'off'

export const useInterfacePrefs = createPreferences('interface', {
  theme: 'dark' as Theme,
  /** Hex accent color; empty = the theme's default accent. */
  accent: '',
  density: 'comfortable' as Density,
  artworkBackground: true as boolean,
  lyricsSize: 'm' as LyricsSize,
  reduceMotion: 'system' as ReduceMotion,
})

export type InterfacePrefs = ReturnType<typeof useInterfacePrefs.getState>['values']

/** First entry ('') is the built-in default accent. */
export const ACCENT_PRESETS = ['', '#0a84ff', '#30d158', '#bf5af2', '#ff9f0a', '#ff375f', '#64d2ff'] as const
export const DEFAULT_ACCENT = '#fc3c44'

export const LYRICS_SIZE_CLASS: Record<LyricsSize, string> = { s: 'text-xl', m: 'text-2xl', l: 'text-3xl', xl: 'text-4xl' }

const DARK_QUERY = '(prefers-color-scheme: dark)'
const MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/** Mixes a hex color 15% toward white (used for the accent hover shade). */
export function hoverColor(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return '#' + [16, 8, 0].map(s => {
    const c = (n >> s) & 255
    return Math.round(c + (255 - c) * 0.15).toString(16).padStart(2, '0')
  }).join('')
}

/** Reflects interface prefs onto <html> (data attributes + accent CSS variables). */
export function applyInterfacePrefs(v: InterfacePrefs) {
  const html = document.documentElement
  const theme = v.theme === 'system' ? (window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light') : v.theme
  html.dataset.theme = theme
  html.dataset.density = v.density
  const reduce = v.reduceMotion === 'system' ? window.matchMedia(MOTION_QUERY).matches : v.reduceMotion === 'on'
  html.toggleAttribute('data-reduce-motion', reduce)
  if (v.accent) {
    html.style.setProperty('--color-accent', v.accent)
    html.style.setProperty('--color-accent-hover', hoverColor(v.accent))
  } else {
    html.style.removeProperty('--color-accent')
    html.style.removeProperty('--color-accent-hover')
  }
}

/** Applies prefs now and keeps them in sync with pref and system changes. Returns a cleanup. */
export function initInterfacePrefs(): () => void {
  const apply = () => applyInterfacePrefs(useInterfacePrefs.getState().values)
  apply()
  const queries = [window.matchMedia(DARK_QUERY), window.matchMedia(MOTION_QUERY)]
  queries.forEach(q => q.addEventListener('change', apply))
  const unsub = useInterfacePrefs.subscribe(apply)
  return () => {
    unsub()
    queries.forEach(q => q.removeEventListener('change', apply))
  }
}
