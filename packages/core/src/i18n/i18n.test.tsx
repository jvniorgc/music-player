import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { en } from './en'
import { ptBR } from './pt-BR'
import { dictionaries, formatDate, formatNumber, resolveLanguage, t, tn, useI18nStore, useT } from '.'
import { LANGUAGE_KEY } from '../lib/language'

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort()

describe('dictionaries', () => {
  it('en and pt-BR have identical key sets', () => {
    expect(Object.keys(ptBR).sort()).toEqual(Object.keys(en).sort())
  })

  it('entries have matching shapes and placeholders in both locales', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      const a = en[key] as string | { one: string; other: string }
      const b = ptBR[key] as string | { one: string; other: string }
      expect(typeof b, key).toBe(typeof a)
      if (typeof a === 'string') {
        expect(placeholders(b as string), key).toEqual(placeholders(a))
      } else {
        const bp = b as { one: string; other: string }
        expect(placeholders(bp.other), key).toEqual(placeholders(a.other))
        expect(bp.one.length, key).toBeGreaterThan(0)
      }
    }
  })

  it('has no empty translations', () => {
    for (const dict of Object.values(dictionaries)) {
      for (const v of Object.values(dict)) {
        const forms = typeof v === 'string' ? [v] : [v.one, v.other]
        forms.forEach(f => expect(f.trim()).not.toBe(''))
      }
    }
  })
})

describe('resolveLanguage', () => {
  it.each([
    ['en', 'pt-BR', 'en'],
    ['pt-BR', 'en-US', 'pt-BR'],
    ['system', 'pt-BR', 'pt-BR'],
    ['system', 'pt-PT', 'pt-BR'],
    ['system', 'pt', 'pt-BR'],
    ['system', 'en-US', 'en'],
    ['system', 'es-ES', 'en'],
    ['system', 'ptx', 'en'],
    ['system', '', 'en'],
  ] as const)('%s with system %s → %s', (pref, sys, expected) => {
    expect(resolveLanguage(pref, sys)).toBe(expected)
  })

  it('falls back to navigator.language when no system language is given', () => {
    const spy = vi.spyOn(navigator, 'language', 'get').mockReturnValue('pt-BR')
    expect(resolveLanguage('system')).toBe('pt-BR')
    spy.mockReturnValue('fr-FR')
    expect(resolveLanguage('system')).toBe('en')
    spy.mockRestore()
  })
})

describe('t / tn', () => {
  it('translates in the active locale and in an explicit one', () => {
    expect(t('common.cancel')).toBe('Cancel')
    expect(t('common.cancel', undefined, 'pt-BR')).toBe('Cancelar')
  })

  it('interpolates variables and leaves unknown placeholders intact', () => {
    expect(t('slsk.started', { name: 'a.flac' })).toBe('Download started: a.flac')
    expect(t('slsk.started', {})).toBe('Download started: {name}')
  })

  it('selects plural forms per locale and formats the count', () => {
    expect(tn('meta.tracks', 1)).toBe('1 track')
    expect(tn('meta.tracks', 3)).toBe('3 tracks')
    expect(tn('meta.tracks', 1234)).toBe('1,234 tracks')
    expect(tn('meta.tracks', 1, undefined, 'pt-BR')).toBe('1 faixa')
    expect(tn('meta.tracks', 1234, undefined, 'pt-BR')).toBe('1.234 faixas')
    expect(t('meta.tracks')).toBe('{count} tracks')
  })
})

describe('formatNumber / formatDate', () => {
  it('uses locale conventions', () => {
    expect(formatNumber(1234.5, 'en')).toBe('1,234.5')
    expect(formatNumber(1234.5, 'pt-BR')).toBe('1.234,5')
    const d = new Date(2024, 0, 15)
    expect(formatDate(d, { year: 'numeric', month: '2-digit', day: '2-digit' }, 'en')).toBe('01/15/2024')
    expect(formatDate(d.getTime(), { year: 'numeric', month: '2-digit', day: '2-digit' }, 'pt-BR')).toBe('15/01/2024')
    expect(formatDate('2024-01-15T12:00:00')).toContain('2024')
    expect(formatDate('not a date')).toBe('')
  })
})

describe('language store', () => {
  afterEach(() => localStorage.removeItem(LANGUAGE_KEY))

  it('setPreference persists, switches locale and sets <html lang>', () => {
    useI18nStore.getState().setPreference('pt-BR')
    expect(localStorage.getItem(LANGUAGE_KEY)).toBe('pt-BR')
    expect(useI18nStore.getState()).toMatchObject({ preference: 'pt-BR', locale: 'pt-BR' })
    expect(document.documentElement.lang).toBe('pt-BR')
    expect(t('common.cancel')).toBe('Cancelar')

    useI18nStore.getState().setPreference('system')
    expect(useI18nStore.getState().locale).toBe('en')
    expect(document.documentElement.lang).toBe('en')
  })

  it('initialises from the stored preference', async () => {
    localStorage.setItem(LANGUAGE_KEY, 'pt-BR')
    vi.resetModules()
    const fresh = await import('.')
    expect(fresh.useI18nStore.getState()).toMatchObject({ preference: 'pt-BR', locale: 'pt-BR' })
    expect(document.documentElement.lang).toBe('pt-BR')
  })

  it('useT re-renders live when the language changes', () => {
    function Probe() {
      const { t, tn, locale } = useT()
      return <p>{locale}: {t('common.cancel')} / {tn('meta.tracks', 2)}</p>
    }
    render(<Probe />)
    expect(screen.getByText('en: Cancel / 2 tracks')).toBeInTheDocument()
    act(() => useI18nStore.getState().setPreference('pt-BR'))
    expect(screen.getByText('pt-BR: Cancelar / 2 faixas')).toBeInTheDocument()
  })
})
