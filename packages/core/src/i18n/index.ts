import { create } from 'zustand'
import { en, type Messages } from './en'
import { ptBR } from './pt-BR'
import { getLanguagePreference, setLanguagePreference, type LanguagePreference } from '../lib/language'

export type Locale = 'en' | 'pt-BR'
export type MessageKey = keyof typeof en
type PluralKey = { [K in MessageKey]: (typeof en)[K] extends string ? never : K }[MessageKey]
export type Vars = Record<string, string | number>

export const dictionaries: Record<Locale, Messages> = { en, 'pt-BR': ptBR }

/** 'system' follows the OS/browser language: any Portuguese variant → pt-BR, else English. */
export function resolveLanguage(pref: LanguagePreference, systemLanguage?: string): Locale {
  if (pref === 'en' || pref === 'pt-BR') return pref
  const sys = systemLanguage ?? (typeof navigator !== 'undefined' ? navigator.language : '')
  return /^pt\b/i.test(sys || '') ? 'pt-BR' : 'en'
}

interface I18nState {
  preference: LanguagePreference
  locale: Locale
  setPreference: (pref: LanguagePreference) => void
}

function applyDocumentLang(locale: Locale) {
  if (typeof document !== 'undefined') document.documentElement.lang = locale
}

export const useI18nStore = create<I18nState>((set) => {
  const preference = getLanguagePreference()
  const locale = resolveLanguage(preference)
  applyDocumentLang(locale)
  return {
    preference,
    locale,
    setPreference: (pref) => {
      setLanguagePreference(pref)
      const next = resolveLanguage(pref)
      applyDocumentLang(next)
      set({ preference: pref, locale: next })
    },
  }
})

function interpolate(template: string, locale: Locale, vars?: Vars): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (m, name: string) => {
    if (!(name in vars)) return m
    const v = vars[name]
    return name === 'count' && typeof v === 'number' ? formatNumber(v, locale) : String(v)
  })
}

/** Translate `key` in the current (or given) locale; plural keys select by `vars.count`. */
export function t(key: MessageKey, vars?: Vars, locale: Locale = useI18nStore.getState().locale): string {
  const entry = dictionaries[locale][key]
  if (typeof entry === 'string') return interpolate(entry, locale, vars)
  const count = Number(vars?.count ?? 0)
  const form = new Intl.PluralRules(locale).select(count) === 'one' ? entry.one : entry.other
  return interpolate(form, locale, vars)
}

/** Shorthand for plural keys: `tn('songCount', 3)`. */
export function tn(key: PluralKey, count: number, vars?: Vars, locale?: Locale): string {
  return t(key, { ...vars, count }, locale)
}

export function formatNumber(value: number, locale: Locale = useI18nStore.getState().locale): string {
  return new Intl.NumberFormat(locale).format(value)
}

export function formatDate(
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
  locale: Locale = useI18nStore.getState().locale,
): string {
  const d = value instanceof Date ? value : new Date(value)
  return isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat(locale, options).format(d)
}

/** React hook: re-renders on language change and returns locale-bound helpers. */
export function useT() {
  const locale = useI18nStore(s => s.locale)
  return {
    locale,
    t: (key: MessageKey, vars?: Vars) => t(key, vars, locale),
    tn: (key: PluralKey, count: number, vars?: Vars) => tn(key, count, vars, locale),
  }
}
