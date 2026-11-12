import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ taken: new Set<string>(), cbs: new Map<string, () => void>() }))

vi.mock('electron', () => ({
  globalShortcut: {
    register: vi.fn((acc: string, cb: () => void) => {
      if (acc === 'Bad') throw new Error('invalid accelerator')
      if (h.taken.has(acc)) return false
      h.cbs.set(acc, cb)
      return true
    }),
    unregister: vi.fn((acc: string) => { h.cbs.delete(acc) }),
  },
}))

import { globalShortcut } from 'electron'
import { applyGlobalShortcuts, clearGlobalShortcuts } from './globalShortcuts'

beforeEach(() => {
  clearGlobalShortcuts()
  h.taken.clear()
})

describe('global shortcuts', () => {
  it('registers combos and forwards presses to the renderer', () => {
    const send = vi.fn()
    const res = applyGlobalShortcuts({ togglePlay: 'CommandOrControl+Alt+Space', next: '', bogus: 'X' } as any, send)
    expect(res).toEqual({ failed: [] })
    h.cbs.get('CommandOrControl+Alt+Space')!()
    expect(send).toHaveBeenCalledWith('togglePlay')
    expect(globalShortcut.register).toHaveBeenCalledTimes(1)
  })

  it('reports combos that are taken or invalid', () => {
    h.taken.add('CommandOrControl+Alt+Right')
    const res = applyGlobalShortcuts({ next: 'CommandOrControl+Alt+Right', previous: 'Bad', volumeUp: 'F7' }, vi.fn())
    expect(res.failed).toEqual(['next', 'previous'])
  })

  it('unregisters previous combos when re-applied or disabled', () => {
    applyGlobalShortcuts({ volumeDown: 'F8' }, vi.fn())
    expect(applyGlobalShortcuts(null, vi.fn())).toEqual({ failed: [] })
    expect(globalShortcut.unregister).toHaveBeenCalledWith('F8')
    expect(h.cbs.size).toBe(0)
  })
})
