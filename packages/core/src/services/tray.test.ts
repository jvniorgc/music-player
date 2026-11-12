import { describe, it, expect, vi } from 'vitest'
import { initTrayIntegration } from './tray'
import { useI18nStore } from '../i18n'

describe('initTrayIntegration', () => {
  it('sends localized labels (again on language change) and routes tray commands', () => {
    const handlers = { playPause: vi.fn(), next: vi.fn(), previous: vi.fn() }
    const stop = initTrayIntegration(handlers)
    expect(window.api.systemSetTrayLabels).toHaveBeenCalledWith({ playPause: 'Play/Pause', next: 'Next', previous: 'Previous', show: 'Show', quit: 'Quit' })
    useI18nStore.setState({ locale: 'pt-BR' })
    expect(window.api.systemSetTrayLabels).toHaveBeenLastCalledWith(expect.objectContaining({ quit: 'Sair' }))
    useI18nStore.setState({ preference: 'pt-BR' })
    expect(window.api.systemSetTrayLabels).toHaveBeenCalledTimes(2)

    const cb = vi.mocked(window.api.onTrayCommand!).mock.calls[0][0]
    cb('playpause'); cb('next'); cb('previous')
    expect(handlers.playPause).toHaveBeenCalledTimes(1)
    expect(handlers.next).toHaveBeenCalledTimes(1)
    expect(handlers.previous).toHaveBeenCalledTimes(1)
    stop()
    useI18nStore.setState({ locale: 'en' })
    expect(window.api.systemSetTrayLabels).toHaveBeenCalledTimes(2)
  })

  it('is a no-op on clients without a tray', () => {
    window.api.systemSetTrayLabels = undefined
    window.api.onTrayCommand = undefined
    expect(() => initTrayIntegration({ playPause: vi.fn(), next: vi.fn(), previous: vi.fn() })()).not.toThrow()
  })

  it('ignores label delivery failures', async () => {
    vi.mocked(window.api.systemSetTrayLabels!).mockRejectedValueOnce(new Error('x'))
    initTrayIntegration({ playPause: vi.fn(), next: vi.fn(), previous: vi.fn() })()
    await Promise.resolve()
  })
})
