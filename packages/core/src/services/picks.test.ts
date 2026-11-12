import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as social from './social'
import * as picks from './picks'
import { jellyfin } from './jellyfin'
import { jsonRes, emptyRes, mockFetchRouter } from '@test/http'

const pick: picks.AlbumPick = {
  weekStart: '2026-11-08', user: { id: 'u1', name: 'Ana' }, albumId: 'a1', albumName: 'Abbey Road', artist: 'The Beatles',
  year: '1969', note: null, createdAt: '2026-11-12T00:00:00Z', updatedAt: '2026-11-12T00:00:00Z',
}

beforeEach(() => {
  window.api.allowOrigin = vi.fn().mockResolvedValue(undefined)
  jellyfin.setAuth({ serverUrl: 'http://jf:8096', token: 'tok', userId: 'u1', username: 'ana', serverId: 's' } as never)
  social.configure('http://social:8099')
})

describe('picks service', () => {
  it('gets the current week', async () => {
    const week = { weekStart: '2026-11-08', expiresAt: '2026-11-15T03:00:00.000Z', items: [pick], mine: pick }
    mockFetchRouter([['/picks/current', jsonRes(week)]])
    expect(await picks.getCurrentPicks()).toEqual(week)
  })

  it('sets and deletes my pick', async () => {
    const fetchMock = mockFetchRouter([['/picks/current', (_u: string, init?: RequestInit) => init?.method === 'DELETE' ? emptyRes(204) : jsonRes(pick)]])
    expect(await picks.setMyPick({ albumId: 'a1', albumName: 'Abbey Road', artist: 'The Beatles' })).toEqual(pick)
    expect(fetchMock).toHaveBeenCalledWith('http://social:8099/picks/current', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ albumId: 'a1', albumName: 'Abbey Road', artist: 'The Beatles' }) }))
    await picks.deleteMyPick()
    expect(fetchMock).toHaveBeenLastCalledWith('http://social:8099/picks/current', expect.objectContaining({ method: 'DELETE' }))
  })

  it('gets history', async () => {
    const fetchMock = mockFetchRouter([['/picks/history', () => jsonRes({ weeks: [{ weekStart: '2026-11-01', items: [pick] }] })]])
    expect(await picks.getPicksHistory(4)).toEqual([{ weekStart: '2026-11-01', items: [pick] }])
    expect(fetchMock.mock.calls[0][0]).toBe('http://social:8099/picks/history?weeks=4')
    await picks.getPicksHistory()
    expect(fetchMock.mock.calls[1][0]).toBe('http://social:8099/picks/history?weeks=8')
  })

  it('computes days left, rounding up and never below 1', () => {
    const now = new Date('2026-11-12T12:00:00Z')
    expect(picks.daysLeft('2026-11-15T03:00:00Z', now)).toBe(3)
    expect(picks.daysLeft('2026-11-12T13:00:00Z', now)).toBe(1)
    expect(picks.daysLeft('2026-11-12T11:00:00Z', now)).toBe(1)
    expect(picks.daysLeft('2026-11-15T03:00:00Z')).toBeGreaterThanOrEqual(1)
  })
})
