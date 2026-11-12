import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NotificationSettings } from './NotificationSettings'
import { useNotificationPrefs } from '../../stores/prefs/notifications'

const requestPermission = vi.fn(async () => 'granted' as NotificationPermission)

beforeEach(() => {
  useNotificationPrefs.getState().reset()
  vi.stubGlobal('Notification', { permission: 'default', requestPermission })
})
afterEach(() => vi.unstubAllGlobals())

describe('NotificationSettings', () => {
  it('asks permission before enabling and toggles off directly', async () => {
    render(<NotificationSettings />)
    const unfocused = screen.getByRole('switch', { name: 'Only when the window is not focused' })
    expect(unfocused).toBeDisabled()
    fireEvent.click(screen.getByRole('switch', { name: 'Notify on track change' }))
    await waitFor(() => expect(useNotificationPrefs.getState().values.trackChange).toBe(true))
    expect(requestPermission).toHaveBeenCalled()
    fireEvent.click(unfocused)
    expect(useNotificationPrefs.getState().values.onlyWhenUnfocused).toBe(false)
    fireEvent.click(screen.getByRole('switch', { name: 'Notify on track change' }))
    expect(useNotificationPrefs.getState().values.trackChange).toBe(false)
  })

  it('warns when permission is denied', async () => {
    requestPermission.mockResolvedValueOnce('denied')
    render(<NotificationSettings />)
    fireEvent.click(screen.getByRole('switch', { name: 'Notify when a download finishes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('blocked')
    expect(useNotificationPrefs.getState().values.downloadComplete).toBe(false)
  })
})
