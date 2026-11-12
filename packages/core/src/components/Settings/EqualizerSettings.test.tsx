import { describe, it, expect, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { EqualizerSettings } from './EqualizerSettings'
import { audioEffects, EQ_PRESETS } from '../../services/audioEffects'

describe('EqualizerSettings', () => {
  beforeEach(() => {
    audioEffects.update({ enabled: false, normalization: false, preamp: 0 })
    audioEffects.setPreset('flat')
  })

  it('toggles the equalizer and normalization', () => {
    render(<EqualizerSettings />)
    const eq = screen.getByRole('switch', { name: 'Enable equalizer' })
    const norm = screen.getByRole('switch', { name: 'Volume normalization' })
    expect(eq).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('slider', { name: 'Preamp' })).toBeDisabled()
    fireEvent.click(eq)
    expect(audioEffects.settings.enabled).toBe(true)
    expect(eq).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('slider', { name: '31 Hz' })).toBeEnabled()
    fireEvent.click(norm)
    expect(audioEffects.settings.normalization).toBe(true)
    expect(norm).toHaveAttribute('aria-checked', 'true')
  })

  it('applies presets, edits bands (switching to Custom) and the preamp', () => {
    audioEffects.update({ enabled: true })
    render(<EqualizerSettings />)
    const preset = screen.getByRole('combobox', { name: 'Preset' }) as HTMLSelectElement
    fireEvent.change(preset, { target: { value: 'rock' } })
    expect(audioEffects.settings.gains).toEqual(EQ_PRESETS.rock)
    expect(screen.getByRole('option', { name: 'Bass Boost' })).toBeInTheDocument()

    fireEvent.change(screen.getByRole('slider', { name: '1 kHz' }), { target: { value: '7' } })
    expect(audioEffects.settings.gains[5]).toBe(7)
    expect(preset.value).toBe('custom')
    expect(screen.getByText('+7 dB')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('slider', { name: 'Preamp' }), { target: { value: '-4' } })
    expect(audioEffects.settings.preamp).toBe(-4)

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(audioEffects.settings.preset).toBe('flat')
    expect(audioEffects.settings.preamp).toBe(0)
  })

  it('reflects external setting changes', () => {
    render(<EqualizerSettings />)
    act(() => audioEffects.setPreset('vocal'))
    expect((screen.getByRole('combobox', { name: 'Preset' }) as HTMLSelectElement).value).toBe('vocal')
  })
})
