import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import { usePlayerStore } from '../../stores/player'
import { useAudioPrefs } from '../../stores/prefs/audio'
import { resolveShortcut } from '../../lib/shortcuts'

vi.mock('../../lib/shortcuts', async (orig) => ({ ...(await orig<object>()), resolveShortcut: vi.fn() }))

afterEach(() => useAudioPrefs.getState().reset())

describe('useKeyboardShortcuts volume step', () => {
  it('uses the volume step preference (default 10%)', () => {
    const setVolume = vi.fn()
    usePlayerStore.setState({ volume: 0.5, setVolume })
    renderHook(() => useKeyboardShortcuts(), { wrapper: MemoryRouter })
    const press = (a: string) => { vi.mocked(resolveShortcut).mockReturnValueOnce(a as never); window.dispatchEvent(new KeyboardEvent('keydown')) }
    press('volumeUp')
    expect(setVolume).toHaveBeenLastCalledWith(0.6)
    useAudioPrefs.getState().set({ volumeStep: 2 })
    press('volumeDown')
    expect(setVolume).toHaveBeenLastCalledWith(0.48)
  })
})
