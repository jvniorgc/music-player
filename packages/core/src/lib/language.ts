export type LanguagePreference = 'en' | 'pt-BR' | 'system'

export const LANGUAGE_KEY = 'language'
export const LANGUAGE_OPTIONS: { value: LanguagePreference; label: string }[] = [
  { value: 'system', label: 'System default' },
  { value: 'en', label: 'English' },
  { value: 'pt-BR', label: 'Português (Brasil)' },
]

export function getLanguagePreference(): LanguagePreference {
  try {
    const v = localStorage.getItem(LANGUAGE_KEY)
    return v === 'en' || v === 'pt-BR' || v === 'system' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function setLanguagePreference(value: LanguagePreference): void {
  try { localStorage.setItem(LANGUAGE_KEY, value) } catch { /* storage unavailable */ }
}
