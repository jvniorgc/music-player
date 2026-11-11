import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SettingsView from './SettingsView'
import { useI18nStore } from '../../i18n'
import { LANGUAGE_KEY } from '../../lib/language'

vi.mock('./LastfmSettings', () => ({ LastfmSettings: () => null }))
vi.mock('./SlskdSettings', () => ({ SlskdSettings: () => null }))

describe('SettingsView language select', () => {
  afterEach(() => localStorage.removeItem(LANGUAGE_KEY))

  it('switches the UI language live and persists the choice', () => {
    render(<MemoryRouter><SettingsView /></MemoryRouter>)
    const select = screen.getByRole('combobox', { name: 'Language' })
    expect(select).toHaveValue('system')

    fireEvent.change(select, { target: { value: 'pt-BR' } })

    expect(screen.getByRole('combobox', { name: 'Idioma' })).toHaveValue('pt-BR')
    expect(screen.getByRole('heading', { name: 'Sobre' })).toBeInTheDocument()
    expect(localStorage.getItem(LANGUAGE_KEY)).toBe('pt-BR')
    expect(document.documentElement.lang).toBe('pt-BR')
    expect(useI18nStore.getState().locale).toBe('pt-BR')
  })
})
