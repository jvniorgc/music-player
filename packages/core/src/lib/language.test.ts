import { describe, it, expect, beforeEach } from 'vitest'
import { getLanguagePreference, setLanguagePreference, LANGUAGE_KEY } from './language'

describe('language preference', () => {
  beforeEach(() => localStorage.clear())
  it('defaults to system and ignores invalid values', () => {
    expect(getLanguagePreference()).toBe('system')
    localStorage.setItem(LANGUAGE_KEY, 'fr')
    expect(getLanguagePreference()).toBe('system')
  })
  it('persists a valid choice', () => {
    setLanguagePreference('pt-BR')
    expect(localStorage.getItem(LANGUAGE_KEY)).toBe('pt-BR')
    expect(getLanguagePreference()).toBe('pt-BR')
  })
})
