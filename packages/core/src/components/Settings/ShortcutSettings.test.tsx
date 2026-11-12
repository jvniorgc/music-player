import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ShortcutSettings } from './ShortcutSettings'
import { useShortcutPrefs, useGlobalShortcutPrefs } from '../../stores/prefs/shortcuts'
import { useGlobalShortcutStatus } from '../../services/globalShortcuts'

const press = (key: string, mods: KeyboardEventInit = {}) => fireEvent.keyDown(window, { key, ...mods })

beforeEach(() => {
  useShortcutPrefs.getState().reset()
  useGlobalShortcutPrefs.getState().reset()
  useGlobalShortcutStatus.setState({ failed: [] })
})

describe('ShortcutSettings', () => {
  it('shows default bindings', () => {
    render(<ShortcutSettings isMac={false} />)
    expect(screen.getByRole('button', { name: 'Change shortcut for Next track' })).toHaveTextContent('Ctrl + →')
    expect(screen.getByRole('button', { name: 'Change shortcut for Search' })).toHaveTextContent('Ctrl + F/')
  })

  it('records a new combo, persists only the override and resets it', () => {
    render(<ShortcutSettings isMac />)
    const btn = screen.getByRole('button', { name: 'Change shortcut for Next track' })
    fireEvent.click(btn)
    expect(btn).toHaveTextContent('Press keys…')
    press('Shift', { shiftKey: true }) // lone modifier is ignored
    press('n', { altKey: true })
    expect(useShortcutPrefs.getState().values.next).toBe('Alt+N')
    expect(btn).toHaveTextContent('⌥ + N')
    expect(JSON.parse(localStorage.getItem('prefs:shortcuts')!).previous).toBe('')

    fireEvent.click(screen.getByRole('button', { name: 'Reset shortcut for Next track' }))
    expect(useShortcutPrefs.getState().values.next).toBe('')
  })

  it('stores the default as no override', () => {
    useShortcutPrefs.getState().set({ mute: 'Q' })
    render(<ShortcutSettings isMac={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Change shortcut for Mute / unmute' }))
    press('m')
    expect(useShortcutPrefs.getState().values.mute).toBe('')
  })

  it('Esc cancels and toggling the button stops recording', () => {
    render(<ShortcutSettings isMac={false} />)
    const btn = screen.getByRole('button', { name: 'Change shortcut for Next track' })
    fireEvent.click(btn)
    press('Escape')
    expect(btn).toHaveTextContent('Ctrl + →')
    fireEvent.click(btn)
    fireEvent.click(btn)
    press('q')
    expect(useShortcutPrefs.getState().values.next).toBe('')
  })

  it('refuses combos already in use and reset-all clears overrides', () => {
    useShortcutPrefs.getState().set({ shuffle: 'Q' })
    render(<ShortcutSettings isMac={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Change shortcut for Next track' }))
    press('m')
    expect(screen.getByRole('alert')).toHaveTextContent('M is already used by "Mute / unmute"')
    fireEvent.click(screen.getByRole('button', { name: 'Change shortcut for Next track' }))
    press('ArrowLeft', { altKey: true })
    expect(screen.getByRole('alert')).toHaveTextContent('Go back / forward')
    expect(useShortcutPrefs.getState().values.next).toBe('')

    fireEvent.click(screen.getByRole('button', { name: 'Reset all to defaults' }))
    expect(useShortcutPrefs.getState().values.shuffle).toBe('')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('edits global shortcuts and shows registration failures', () => {
    render(<ShortcutSettings isMac={false} />)
    fireEvent.click(screen.getByRole('switch', { name: 'Global media shortcuts' }))
    expect(useGlobalShortcutPrefs.getState().values.enabled).toBe(true)
    act(() => useGlobalShortcutStatus.setState({ failed: ['next'] }))
    expect(screen.getByText("Couldn't register (combo in use by another app)")).toBeInTheDocument()

    const buttons = screen.getAllByRole('button', { name: 'Change shortcut for Volume up' })
    const globalBtn = buttons[1]
    expect(globalBtn).toHaveTextContent('Ctrl + Alt + ↑')

    fireEvent.click(globalBtn)
    press('u')
    expect(screen.getByRole('alert')).toHaveTextContent('Global shortcuts need Ctrl/⌘ or Alt')

    fireEvent.click(globalBtn)
    press('ArrowRight', { ctrlKey: true, altKey: true })
    expect(screen.getByRole('alert')).toHaveTextContent('already used by "Next track"')

    fireEvent.click(globalBtn)
    press('u', { ctrlKey: true, altKey: true })
    expect(useGlobalShortcutPrefs.getState().values.volumeUp).toBe('Mod+Alt+U')
    fireEvent.click(screen.getAllByRole('button', { name: 'Reset shortcut for Volume up' })[1])
    expect(useGlobalShortcutPrefs.getState().values.volumeUp).toBe('Mod+Alt+ArrowUp')
  })
})
