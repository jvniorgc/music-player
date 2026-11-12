import { describe, it, expect, beforeEach, vi } from 'vitest'

async function load() {
  vi.resetModules()
  return import('./privacy')
}

beforeEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})

describe('privacy preferences', () => {
  it('defaults preserve current behavior', async () => {
    const p = await load()
    expect(p.isPrivateSession()).toBe(false)
    expect(p.shouldReportPlays()).toBe(true)
    expect(p.usePrivacyPrefs.getState().values.privateExpiry).toBe('never')
  })

  it('private session blocks play reporting; report toggle is independent', async () => {
    const p = await load()
    p.setPrivateSession(true)
    expect(p.isPrivateSession()).toBe(true)
    expect(p.shouldReportPlays()).toBe(false)
    p.setPrivateSession(false)
    p.usePrivacyPrefs.getState().set({ reportPlays: false })
    expect(p.isPrivateSession()).toBe(false)
    expect(p.shouldReportPlays()).toBe(false)
  })

  it('expires a 1h private session', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    const p = await load()
    p.setPrivateSession(true, '1h')
    expect(p.usePrivacyPrefs.getState().values.privateUntil).toBe(1_000_000 + p.PRIVATE_HOUR_MS)
    expect(p.isPrivateSession()).toBe(true)
    vi.setSystemTime(1_000_000 + p.PRIVATE_HOUR_MS)
    expect(p.isPrivateSession()).toBe(false)
    expect(p.usePrivacyPrefs.getState().values.privateSession).toBe(false)
  })

  it('keeps the chosen expiry when toggling without one', async () => {
    const p = await load()
    p.setPrivateSession(true, 'restart')
    p.setPrivateSession(false)
    expect(p.usePrivacyPrefs.getState().values).toMatchObject({ privateSession: false, privateExpiry: 'restart', privateUntil: 0 })
  })

  it('ends an "until restart" session on the next launch but keeps a "never" one', async () => {
    localStorage.setItem('prefs:privacy', JSON.stringify({ privateSession: true, privateExpiry: 'restart' }))
    expect((await load()).isPrivateSession()).toBe(false)
    localStorage.setItem('prefs:privacy', JSON.stringify({ privateSession: true, privateExpiry: 'never' }))
    expect((await load()).isPrivateSession()).toBe(true)
  })

  it('clearListeningData removes recent searches and the popularity cache', async () => {
    localStorage.setItem('recent_searches', JSON.stringify(['a']))
    localStorage.setItem('lastfm_popularity_cache_v1', '{}')
    const p = await load()
    p.clearListeningData()
    expect(localStorage.getItem('recent_searches')).toBe('[]')
    expect(localStorage.getItem('lastfm_popularity_cache_v1')).toBeNull()
  })
})
