import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PrivacySettings } from './PrivacySettings'
import { usePrivacyPrefs } from '../../stores/prefs/privacy'
import { useToastStore } from '../../stores/toast'

beforeEach(() => {
  localStorage.clear()
  usePrivacyPrefs.getState().reset()
})

describe('PrivacySettings', () => {
  it('toggles the private session, its expiry and play reporting', () => {
    vi.useFakeTimers({ now: 5000 })
    render(<PrivacySettings />)
    const priv = screen.getByRole('switch', { name: 'Private session' })
    expect(priv).toHaveAttribute('aria-checked', 'false')
    fireEvent.change(screen.getByLabelText('End private session'), { target: { value: '1h' } })
    fireEvent.click(priv)
    expect(priv).toHaveAttribute('aria-checked', 'true')
    expect(usePrivacyPrefs.getState().values).toMatchObject({ privateExpiry: '1h', privateUntil: 5000 + 3_600_000 })

    const report = screen.getByRole('switch', { name: 'Report plays to Jellyfin' })
    expect(report).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(report)
    expect(usePrivacyPrefs.getState().values.reportPlays).toBe(false)
    vi.useRealTimers()
  })

  it('clears listening data after confirmation', () => {
    localStorage.setItem('recent_searches', JSON.stringify(['x']))
    render(<PrivacySettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear listening data' }))
    expect(localStorage.getItem('recent_searches')).toBe('["x"]')
    const buttons = screen.getAllByRole('button', { name: 'Clear listening data' })
    fireEvent.click(buttons[buttons.length - 1])
    expect(localStorage.getItem('recent_searches')).toBe('[]')
    expect(useToastStore.getState().toasts.at(-1)?.message).toBe('Listening data cleared')
  })
})
