import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useToastStore } from './toast'

beforeEach(() => {
  vi.useFakeTimers()
  useToastStore.setState({ toasts: [] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('toast store', () => {
  it('show adds a toast with the default "info" type', () => {
    useToastStore.getState().show('Hello')
    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({ message: 'Hello', type: 'info' })
    expect(toasts[0].id).toBeTruthy()
  })

  it('show honors an explicit type', () => {
    useToastStore.getState().show('Boom', 'error')
    expect(useToastStore.getState().toasts[0].type).toBe('error')
  })

  it('auto-dismisses a toast after 3 seconds', () => {
    useToastStore.getState().show('Temp')
    expect(useToastStore.getState().toasts).toHaveLength(1)
    vi.advanceTimersByTime(3000)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('dismiss removes only the matching toast', () => {
    useToastStore.getState().show('A')
    useToastStore.getState().show('B')
    const [a] = useToastStore.getState().toasts
    useToastStore.getState().dismiss(a.id)
    const remaining = useToastStore.getState().toasts
    expect(remaining).toHaveLength(1)
    expect(remaining[0].message).toBe('B')
  })
})
