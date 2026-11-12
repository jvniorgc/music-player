import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SystemSettings } from './SystemSettings'
import { useSystemPrefs } from '../../stores/prefs/system'
import { useToastStore } from '../../stores/toast'

const base = { launchAtLogin: false, startMinimized: false, closeToTray: false, hardwareAcceleration: true, restartRequired: false }

beforeEach(() => {
  localStorage.clear()
  useSystemPrefs.getState().reset()
})

describe('SystemSettings', () => {
  it('loads native settings and saves changes through window.api', async () => {
    render(<SystemSettings />)
    const login = await screen.findByRole('switch', { name: 'Open at login' })
    vi.mocked(window.api.systemSetSettings!).mockResolvedValueOnce({ ...base, launchAtLogin: true })
    fireEvent.click(login)
    expect(window.api.systemSetSettings).toHaveBeenCalledWith({ launchAtLogin: true })
    await waitFor(() => expect(login).toHaveAttribute('aria-checked', 'true'))

    fireEvent.click(screen.getByRole('switch', { name: 'Start minimized' }))
    expect(window.api.systemSetSettings).toHaveBeenLastCalledWith({ startMinimized: true })
    fireEvent.change(screen.getByLabelText('Closing the window'), { target: { value: 'tray' } })
    expect(window.api.systemSetSettings).toHaveBeenLastCalledWith({ closeToTray: true })
  })

  it('shows a restart note with a relaunch button after toggling hardware acceleration', async () => {
    vi.mocked(window.api.systemSetSettings!).mockResolvedValueOnce({ ...base, hardwareAcceleration: false, restartRequired: true })
    render(<SystemSettings />)
    fireEvent.click(await screen.findByRole('switch', { name: 'Hardware acceleration' }))
    expect(window.api.systemSetSettings).toHaveBeenCalledWith({ hardwareAcceleration: false })
    fireEvent.click(await screen.findByRole('button', { name: 'Restart now' }))
    expect(window.api.systemRelaunch).toHaveBeenCalled()
  })

  it('toasts when saving fails', async () => {
    vi.mocked(window.api.systemSetSettings!).mockRejectedValueOnce(new Error('x'))
    render(<SystemSettings />)
    fireEvent.click(await screen.findByRole('switch', { name: 'Open at login' }))
    await waitFor(() => expect(useToastStore.getState().toasts.at(-1)?.message).toBe("Couldn't update the system setting"))
  })

  it('manages resume preferences, and hides native options on clients without them', () => {
    window.api.systemGetSettings = undefined
    render(<SystemSettings />)
    expect(screen.queryByRole('switch', { name: 'Open at login' })).toBeNull()
    fireEvent.click(screen.getByRole('switch', { name: 'Start playing when resuming' }))
    expect(useSystemPrefs.getState().values.resumeAutoplay).toBe(true)
    fireEvent.click(screen.getByRole('switch', { name: 'Resume last session on startup' }))
    expect(useSystemPrefs.getState().values.resumeSession).toBe(false)
    expect(screen.queryByRole('switch', { name: 'Start playing when resuming' })).toBeNull()
  })
})
