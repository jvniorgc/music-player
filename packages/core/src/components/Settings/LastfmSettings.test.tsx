import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LastfmSettings } from './LastfmSettings'
import { _resetPopularity, POPULARITY_SETTING_KEY, usePopularityStore } from '../../services/popularity'

const configured = { configured: true, connected: false, enabled: false, username: null }

describe('LastfmSettings popularity toggle', () => {
  beforeEach(() => _resetPopularity())

  it('is disabled with a hint when no API key is configured', async () => {
    render(<LastfmSettings />)
    const toggle = screen.getByRole('switch', { name: 'Show Last.fm popularity' })
    expect(toggle).toBeDisabled()
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText(/Add a Last.fm API key/)).toBeInTheDocument()
    await waitFor(() => expect(usePopularityStore.getState().loaded).toBe(true))
  })

  it('defaults off, then persists when toggled on and off', async () => {
    vi.mocked(window.api.lastfmGetStatus).mockResolvedValue(configured)
    render(<LastfmSettings />)
    const toggle = screen.getByRole('switch', { name: 'Show Last.fm popularity' })
    await waitFor(() => expect(toggle).toBeEnabled())
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(window.api.setSetting).toHaveBeenCalledWith(POPULARITY_SETTING_KEY, '1')

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(window.api.setSetting).toHaveBeenLastCalledWith(POPULARITY_SETTING_KEY, '0')
  })

  it('restores the persisted value', async () => {
    vi.mocked(window.api.lastfmGetStatus).mockResolvedValue(configured)
    vi.mocked(window.api.getSetting).mockImplementation(async k => (k === POPULARITY_SETTING_KEY ? '1' : null))
    render(<LastfmSettings />)
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Show Last.fm popularity' })).toHaveAttribute('aria-checked', 'true'))
  })
})
