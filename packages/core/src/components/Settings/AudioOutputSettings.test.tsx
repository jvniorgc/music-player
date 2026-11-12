import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AudioOutputSettings } from './AudioOutputSettings'
import { useAudioPrefs } from '../../stores/prefs/audio'
import { audioOutput } from '../../services/audioOutput'

beforeEach(() => useAudioPrefs.getState().reset())

describe('AudioOutputSettings', () => {
  it('lists output devices with generic labels and persists the choice', async () => {
    vi.spyOn(audioOutput, 'listDevices').mockResolvedValue([
      { deviceId: 'default', label: '' }, { deviceId: 'usb', label: 'USB DAC' }, { deviceId: 'x', label: '' },
    ] as MediaDeviceInfo[])
    render(<AudioOutputSettings />)
    const select = screen.getByRole('combobox', { name: 'Output device' })
    expect(await screen.findByRole('option', { name: 'USB DAC' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Audio device 2' })).toBeInTheDocument()
    expect(screen.getAllByRole('option', { name: 'System default' })).toHaveLength(1)
    fireEvent.change(select, { target: { value: 'usb' } })
    expect(useAudioPrefs.getState().values.deviceId).toBe('usb')
  })

  it('updates max volume, mono and volume step', () => {
    vi.spyOn(audioOutput, 'listDevices').mockResolvedValue([])
    render(<AudioOutputSettings />)
    fireEvent.change(screen.getByRole('slider', { name: 'Maximum volume' }), { target: { value: '70' } })
    fireEvent.click(screen.getByRole('switch', { name: 'Mono audio' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Volume step (keyboard)' }), { target: { value: '5' } })
    expect(useAudioPrefs.getState().values).toMatchObject({ maxVolume: 70, mono: true, volumeStep: 5 })
    expect(screen.getByText('70%')).toBeInTheDocument()
  })
})
