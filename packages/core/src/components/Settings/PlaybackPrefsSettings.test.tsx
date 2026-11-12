import { describe, it, expect, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PlaybackPrefsSettings } from './PlaybackPrefsSettings'
import { usePlaybackPrefs } from '../../stores/prefs/playback'

const values = () => usePlaybackPrefs.getState().values

describe('PlaybackPrefsSettings', () => {
  beforeEach(() => usePlaybackPrefs.getState().reset())

  it('shows defaults and updates every preference', () => {
    render(<PlaybackPrefsSettings />)
    expect(screen.getByText('Off')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('slider', { name: 'Crossfade' }), { target: { value: '6' } })
    expect(values().crossfade).toBe(6)
    expect(screen.getByText('6 s')).toBeInTheDocument()

    const gapless = screen.getByRole('switch', { name: 'Gapless playback' })
    expect(gapless).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(gapless)
    expect(values().gapless).toBe(false)
    expect(gapless).toHaveAttribute('aria-checked', 'false')

    const prev = screen.getByRole('combobox', { name: '"Previous" restarts the track after' })
    expect(prev).toHaveValue('3')
    expect(screen.getByRole('option', { name: 'Never (always go back)' })).toBeInTheDocument()
    fireEvent.change(prev, { target: { value: '10' } })
    expect(values().previousThreshold).toBe(10)

    fireEvent.change(screen.getByRole('combobox', { name: 'When the queue ends' }), { target: { value: 'radio' } })
    expect(values().queueEnd).toBe('radio')

    fireEvent.change(screen.getByRole('combobox', { name: 'Clicking a song' }), { target: { value: 'next' } })
    expect(values().songClick).toBe('next')
  })
})
