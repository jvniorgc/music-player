import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { PrivateSessionToggle } from './PrivateSessionToggle'
import { usePrivacyPrefs, setPrivateSession } from '../../stores/prefs/privacy'

beforeEach(() => usePrivacyPrefs.getState().reset())

describe('PrivateSessionToggle', () => {
  it('starts and ends a private session, labeling the active state', () => {
    render(<PrivateSessionToggle />)
    const btn = screen.getByRole('button', { name: 'Start private session' })
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    expect(btn).toHaveTextContent('Private session')
    fireEvent.click(btn)
    expect(usePrivacyPrefs.getState().values.privateSession).toBe(false)
  })

  it('ends a timed session when it expires', () => {
    vi.useFakeTimers()
    setPrivateSession(true, '1h')
    render(<PrivateSessionToggle />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
    act(() => { vi.advanceTimersByTime(60 * 60 * 1000) })
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false')
    vi.useRealTimers()
  })
})
