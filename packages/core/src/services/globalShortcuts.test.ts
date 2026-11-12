import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initGlobalShortcuts, useGlobalShortcutStatus } from './globalShortcuts'
import { useGlobalShortcutPrefs } from '../stores/prefs/shortcuts'
import { runPlayerAction } from './playerActions'

vi.mock('./playerActions', () => ({ runPlayerAction: vi.fn() }))

const flush = () => new Promise(r => setTimeout(r, 0))

beforeEach(() => {
  useGlobalShortcutPrefs.getState().reset()
  useGlobalShortcutStatus.setState({ failed: [] })
})

describe('initGlobalShortcuts', () => {
  it('stays unregistered while disabled and syncs accelerators once enabled', async () => {
    const stop = initGlobalShortcuts()
    await flush()
    expect(window.api.setGlobalShortcuts).toHaveBeenLastCalledWith(null)

    vi.mocked(window.api.setGlobalShortcuts!).mockResolvedValueOnce({ failed: ['next'] })
    useGlobalShortcutPrefs.getState().set({ enabled: true })
    await flush()
    expect(window.api.setGlobalShortcuts).toHaveBeenLastCalledWith({
      togglePlay: 'CommandOrControl+Alt+Space',
      next: 'CommandOrControl+Alt+Right',
      previous: 'CommandOrControl+Alt+Left',
      volumeUp: 'CommandOrControl+Alt+Up',
      volumeDown: 'CommandOrControl+Alt+Down',
    })
    expect(useGlobalShortcutStatus.getState().failed).toEqual(['next'])

    vi.mocked(window.api.setGlobalShortcuts!).mockRejectedValueOnce(new Error('ipc'))
    useGlobalShortcutPrefs.getState().set({ next: 'Mod+Alt+N' })
    await flush()
    expect(useGlobalShortcutStatus.getState().failed).toEqual([])

    stop()
    expect(window.api.setGlobalShortcuts).toHaveBeenLastCalledWith(null)
  })

  it('runs the player action for presses from the main process', () => {
    initGlobalShortcuts()()
    const cb = vi.mocked(window.api.onGlobalShortcut!).mock.calls[0][0]
    cb('volumeUp')
    expect(runPlayerAction).toHaveBeenCalledWith('volumeUp')
  })

  it('is a no-op on platforms without global shortcuts', () => {
    delete window.api.setGlobalShortcuts
    initGlobalShortcuts()()
    expect(window.api.onGlobalShortcut).not.toHaveBeenCalled()
  })
})
