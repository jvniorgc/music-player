import { describe, it, expect, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { InterfaceSettings } from './InterfaceSettings'
import { useInterfacePrefs, ACCENT_PRESETS } from '../../stores/prefs/interface'

const v = () => useInterfacePrefs.getState().values

describe('InterfaceSettings', () => {
  beforeEach(() => useInterfacePrefs.getState().reset())

  it('edits every interface preference', () => {
    render(<InterfaceSettings />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Theme' }), { target: { value: 'light' } })
    expect(v().theme).toBe('light')
    fireEvent.change(screen.getByRole('combobox', { name: 'List density' }), { target: { value: 'compact' } })
    expect(v().density).toBe('compact')
    fireEvent.change(screen.getByRole('combobox', { name: 'Lyrics font size' }), { target: { value: 'xl' } })
    expect(v().lyricsSize).toBe('xl')
    fireEvent.change(screen.getByRole('combobox', { name: 'Reduce motion' }), { target: { value: 'on' } })
    expect(v().reduceMotion).toBe('on')
    const art = screen.getByRole('switch', { name: 'Artwork-tinted background' })
    expect(art).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(art)
    expect(v().artworkBackground).toBe(false)
    expect(art).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(screen.getByRole('switch', { name: "Show friends' \"Listening now\"" }))
    expect(v().showNowPlaying).toBe(false)
  })

  it('picks accent presets and custom colors', () => {
    render(<InterfaceSettings />)
    const def = screen.getByRole('radio', { name: 'Accent color 1' })
    expect(def).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: 'Accent color 2' }))
    expect(v().accent).toBe(ACCENT_PRESETS[1])
    expect(def).toHaveAttribute('aria-checked', 'false')
    fireEvent.change(screen.getByLabelText('Custom accent color'), { target: { value: '#123456' } })
    expect(v().accent).toBe('#123456')
    fireEvent.click(def)
    expect(v().accent).toBe('')
  })
})
