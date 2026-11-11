import { describe, it, expect, vi, afterEach } from 'vitest'
import { timeoutSignal, isAbortError } from './http'

afterEach(() => { vi.useRealTimers() })

describe('timeoutSignal', () => {
  it('aborts with a TimeoutError after the timeout', () => {
    vi.useFakeTimers()
    const s = timeoutSignal(undefined, 1000)
    expect(s.aborted).toBe(false)
    vi.advanceTimersByTime(1000)
    expect(s.aborted).toBe(true)
    expect(isAbortError(s.reason)).toBe(true)
  })

  it('follows the caller signal', () => {
    const c = new AbortController()
    const s = timeoutSignal(c.signal, 60_000)
    c.abort()
    expect(s.aborted).toBe(true)
  })

  it('is already aborted when the caller signal is', () => {
    const c = new AbortController()
    c.abort()
    expect(timeoutSignal(c.signal).aborted).toBe(true)
  })
})
