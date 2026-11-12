import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { FriendsNowPlaying } from './FriendsNowPlaying'
import { useInterfacePrefs } from '../../stores/prefs/interface'
import type { FriendNowPlaying } from '../../services/nowPlaying'

const h = vi.hoisted(() => ({ list: vi.fn(), getItem: vi.fn(), setQueue: vi.fn() }))
vi.mock('../../services/nowPlaying', async (orig) => ({ ...(await orig<object>()), listNowPlaying: h.list }))
vi.mock('../../services/jellyfin', () => ({ jellyfin: { getItem: h.getItem, getUserImageUrl: (id: string) => `img://${id}` } }))
vi.mock('../../services/playback', () => ({ playback: { setQueue: h.setQueue } }))

const entry = (over: Partial<FriendNowPlaying> = {}): FriendNowPlaying => ({
  userId: 'bia', userName: 'Bia', client: 'Web', deviceName: 'Firefox',
  item: { id: 'i1', name: 'Song', artists: ['Art'], album: 'Alb', albumId: 'a1', runTimeTicks: 2_000_000_000 },
  positionTicks: 300_000_000, isPaused: false, lastActivity: null, ...over,
})

const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve() })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(1_000_000)
  h.list.mockReset().mockResolvedValue([entry()])
  useInterfacePrefs.getState().reset()
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
})
afterEach(() => vi.useRealTimers())

describe('FriendsNowPlaying', () => {
  it('lists friends and polls every 15s while visible', async () => {
    render(<FriendsNowPlaying />)
    await settle()
    expect(screen.getByText('Listening now')).toBeInTheDocument()
    expect(screen.getByText('Bia')).toBeInTheDocument()
    expect(screen.getByText('Song — Art')).toBeInTheDocument()
    expect(h.list).toHaveBeenCalledTimes(1)
    await act(async () => { vi.advanceTimersByTime(15_000) })
    expect(h.list).toHaveBeenCalledTimes(2)
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    await act(async () => { vi.advanceTimersByTime(15_000) })
    expect(h.list).toHaveBeenCalledTimes(2)
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(h.list).toHaveBeenCalledTimes(3)
  })

  it('renders as a home section and shows a paused indicator', async () => {
    h.list.mockResolvedValue([entry({ isPaused: true, item: { ...entry().item, artists: [] } })])
    render(<FriendsNowPlaying />)
    await settle()
    expect(screen.getByLabelText('Paused')).toBeInTheDocument()
    expect(screen.getByText('Song')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Listening now' })).toBeInTheDocument()
  })

  it('joins: plays the track at the adjusted position', async () => {
    h.getItem.mockResolvedValue({ Id: 'i1', Name: 'Song' })
    render(<FriendsNowPlaying />)
    await settle()
    vi.setSystemTime(1_005_000)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Join Bia' })) })
    expect(h.getItem).toHaveBeenCalledWith('i1')
    expect(h.setQueue).toHaveBeenCalledWith([{ Id: 'i1', Name: 'Song' }], 0, { type: 'custom', name: 'Bia' }, { startAt: 35 })
  })

  it('ignores join failures', async () => {
    h.getItem.mockRejectedValue(new Error('x'))
    render(<FriendsNowPlaying />)
    await settle()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Join Bia' })) })
    expect(h.setQueue).not.toHaveBeenCalled()
  })

  it('hides when empty, on error or disabled', async () => {
    h.list.mockResolvedValue([])
    const { unmount } = render(<FriendsNowPlaying />)
    await settle()
    expect(screen.queryByText('Listening now')).not.toBeInTheDocument()
    unmount()

    h.list.mockRejectedValue(new Error('503'))
    render(<FriendsNowPlaying />).unmount()
    await settle()

    h.list.mockClear()
    useInterfacePrefs.getState().set({ showNowPlaying: false })
    render(<FriendsNowPlaying />)
    await settle()
    expect(h.list).not.toHaveBeenCalled()
    expect(screen.queryByText('Listening now')).not.toBeInTheDocument()
  })
})
