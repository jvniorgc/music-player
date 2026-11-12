import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as social from '../services/social'
import * as recs from '../services/friendRecs'
import { useInboxStore, initInboxAutoListen, startInboxPolling } from './inbox'
import { usePlayerStore } from './player'
import * as privacy from './prefs/privacy'

const rec = (over: Record<string, unknown> = {}) => ({ id: 1, item: { type: 'track', id: 't1' }, ...over }) as never
const play = (Id: string, AlbumId?: string) =>
  usePlayerStore.setState({ currentTrack: { id: Id, item: { Id, AlbumId } as never } })
const flush = () => new Promise(r => setTimeout(r, 0))

beforeEach(() => {
  useInboxStore.setState({ configured: false, unread: 0, pending: null })
  usePlayerStore.setState({ currentTrack: null })
  vi.spyOn(social, 'loadConfig').mockResolvedValue()
  vi.spyOn(social, 'isConfigured').mockReturnValue(true)
  vi.spyOn(recs, 'getUnreadCount').mockResolvedValue(1)
  vi.spyOn(recs, 'getInbox').mockResolvedValue([rec(), rec({ id: 2, item: { type: 'album', id: 'al' } })])
  vi.spyOn(recs, 'markListened').mockResolvedValue(rec())
  vi.spyOn(privacy, 'isPrivateSession').mockReturnValue(false)
})
afterEach(() => { vi.useRealTimers() })

describe('inbox store', () => {
  it('refresh sets unread and drops the cached list when it changes', async () => {
    useInboxStore.setState({ configured: true, unread: 1, pending: [] })
    await useInboxStore.getState().refresh()
    expect(useInboxStore.getState().pending).toEqual([])
    vi.mocked(recs.getUnreadCount).mockResolvedValueOnce(4)
    await useInboxStore.getState().refresh()
    expect(useInboxStore.getState()).toMatchObject({ unread: 4, pending: null })
  })

  it('refresh is a no-op when not configured and swallows errors', async () => {
    await useInboxStore.getState().refresh()
    expect(recs.getUnreadCount).not.toHaveBeenCalled()
    useInboxStore.setState({ configured: true })
    vi.mocked(recs.getUnreadCount).mockRejectedValueOnce(new Error('x'))
    await useInboxStore.getState().refresh()
    expect(useInboxStore.getState().unread).toBe(0)
  })

  it('polls every 60s once configured and stops on cleanup', async () => {
    vi.useFakeTimers()
    const stop = startInboxPolling()
    await vi.advanceTimersByTimeAsync(0)
    expect(useInboxStore.getState()).toMatchObject({ configured: true, unread: 1 })
    expect(recs.getUnreadCount).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(recs.getUnreadCount).toHaveBeenCalledTimes(2)
    stop()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(recs.getUnreadCount).toHaveBeenCalledTimes(2)
  })

  it('does not poll when unconfigured or stopped before config loads', async () => {
    vi.mocked(social.isConfigured).mockReturnValue(false)
    startInboxPolling()
    await flush()
    expect(useInboxStore.getState().configured).toBe(false)
    vi.mocked(social.isConfigured).mockReturnValue(true)
    startInboxPolling()()
    await flush()
    expect(recs.getUnreadCount).not.toHaveBeenCalled()
  })
})

describe('auto mark listened', () => {
  it('marks matching unread recommendations when a track starts', async () => {
    const stop = initInboxAutoListen()
    useInboxStore.setState({ configured: true, unread: 2 })
    play('x', 'al')
    await flush()
    expect(recs.getInbox).toHaveBeenCalledWith(true)
    expect(recs.markListened).toHaveBeenCalledWith(2)
    expect(recs.markListened).toHaveBeenCalledTimes(1)
    expect(useInboxStore.getState().pending).toEqual([rec()])
    play('t1')
    await flush()
    expect(recs.getInbox).toHaveBeenCalledTimes(1)
    expect(recs.markListened).toHaveBeenCalledWith(1)
    stop()
  })

  it('skips when unconfigured, nothing unread, private, no track, or same track', async () => {
    const stop = initInboxAutoListen()
    play('t1')
    useInboxStore.setState({ configured: true, unread: 0 })
    play('t2')
    useInboxStore.setState({ unread: 1 })
    vi.mocked(privacy.isPrivateSession).mockReturnValue(true)
    play('t1')
    vi.mocked(privacy.isPrivateSession).mockReturnValue(false)
    usePlayerStore.setState({ currentTrack: null })
    usePlayerStore.setState({ isPlaying: true })
    await flush()
    expect(recs.getInbox).not.toHaveBeenCalled()
    stop()
  })

  it('swallows errors', async () => {
    const stop = initInboxAutoListen()
    useInboxStore.setState({ configured: true, unread: 1 })
    vi.mocked(recs.getInbox).mockRejectedValueOnce(new Error('x'))
    play('t1')
    await flush()
    expect(recs.markListened).not.toHaveBeenCalled()
    stop()
  })
})
