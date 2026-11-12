import { describe, it, expect, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SettingsView from './SettingsView'
import { useToastStore } from '../../stores/toast'
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

describe('SettingsView Discord toggle', () => {
  const sw = () => screen.getByRole('switch', { name: "Show what I'm listening to on Discord" })

  it('defaults off and persists when toggled on', async () => {
    render(<MemoryRouter><SettingsView /></MemoryRouter>)
    expect(sw()).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(sw())
    await waitFor(() => expect(sw()).toHaveAttribute('aria-checked', 'true'))
    expect(window.api.discordSetEnabled).toHaveBeenCalledWith(true)
  })

  it('reflects the stored value and shows an error if saving fails', async () => {
    vi.mocked(window.api.discordGetEnabled).mockResolvedValue(true)
    vi.mocked(window.api.discordSetEnabled).mockRejectedValue(new Error('x'))
    render(<MemoryRouter><SettingsView /></MemoryRouter>)
    await waitFor(() => expect(sw()).toHaveAttribute('aria-checked', 'true'))
    fireEvent.click(sw())
    await waitFor(() => expect(useToastStore.getState().toasts).toContainEqual(
      expect.objectContaining({ message: 'Failed to update Discord setting', type: 'error' })))
    expect(sw()).toHaveAttribute('aria-checked', 'true')
  })
})
