import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { usePlayerStore } from '../stores/player'
import { initDiscordPresence, setDiscordEnabled, getDiscordEnabled, toPresence, THROTTLE_MS } from './discord'
import type { JellyfinItem } from './jellyfin'

const item = {
  Id: 'a', Name: 'Song', Artists: ['Band', 'Guest'], Album: 'LP', RunTimeTicks: 200 * 10_000_000,
} as JellyfinItem

const flush = () => vi.advanceTimersByTimeAsync(0)

function play(id = 'a', currentTime = 0) {
  usePlayerStore.setState({ currentTrack: { id, item: { ...item, Id: id } }, isPlaying: true, currentTime, duration: 200 })
}

let stop: () => void = () => {}

beforeEach(() => {
  vi.useFakeTimers()
  usePlayerStore.setState({ currentTrack: null, isPlaying: false, currentTime: 0, duration: 0 })
})

afterEach(() => {
  stop()
  vi.useRealTimers()
})

describe('toPresence', () => {
  it('maps a playing track and never includes URLs', () => {
    expect(toPresence({ currentTrack: { id: 'a', item }, isPlaying: true, currentTime: 12.5, duration: 0 }))
      .toEqual({ title: 'Song', artist: 'Band, Guest', album: 'LP', position: 12.5, duration: 200 })
  })

  it('falls back to album artist and the player duration', () => {
    const it2 = { Id: 'b', Name: 'X', AlbumArtist: 'AA' } as JellyfinItem
    expect(toPresence({ currentTrack: { id: 'b', item: it2 }, isPlaying: true, currentTime: 0, duration: 99 }))
      .toEqual({ title: 'X', artist: 'AA', album: undefined, position: 0, duration: 99 })
    const it3 = { Id: 'c', Name: 'Y' } as JellyfinItem
    expect(toPresence({ currentTrack: { id: 'c', item: it3 }, isPlaying: true, currentTime: 0, duration: 0 })!.artist).toBe('')
  })

  it('is null when paused or stopped', () => {
    expect(toPresence({ currentTrack: { id: 'a', item }, isPlaying: false, currentTime: 0, duration: 0 })).toBeNull()
    expect(toPresence({ currentTrack: null, isPlaying: true, currentTime: 0, duration: 0 })).toBeNull()
  })
})

describe('initDiscordPresence', () => {
  it('pushes nothing while disabled (default off)', async () => {
    stop = initDiscordPresence()
    await flush()
    play()
    await vi.advanceTimersByTimeAsync(THROTTLE_MS * 2)
    expect(window.api.discordSetActivity).not.toHaveBeenCalled()
  })

  it('pushes on track change, play, pause and seek — throttled', async () => {
    vi.mocked(window.api.discordGetEnabled).mockResolvedValue(true)
    play('a')
    stop = initDiscordPresence()
    await flush()
    const send = vi.mocked(window.api.discordSetActivity)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Song', position: 0 }))

    // Rapid changes inside the throttle window collapse into one trailing push.
    play('b')
    play('c')
    await flush()
    expect(send).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(THROTTLE_MS)
    expect(send).toHaveBeenCalledTimes(2)

    // Normal time progress does not push.
    await vi.advanceTimersByTimeAsync(5000)
    usePlayerStore.setState({ currentTime: 5 })
    await vi.advanceTimersByTimeAsync(THROTTLE_MS)
    expect(send).toHaveBeenCalledTimes(2)

    // Seek (position jump) pushes.
    usePlayerStore.setState({ currentTime: 120 })
    await flush()
    expect(send).toHaveBeenCalledTimes(3)
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ position: 120 }))

    // Pause clears.
    await vi.advanceTimersByTimeAsync(THROTTLE_MS)
    usePlayerStore.setState({ isPlaying: false })
    await flush()
    expect(send).toHaveBeenLastCalledWith(null)
    const n = send.mock.calls.length

    // Already cleared: no duplicate null push.
    usePlayerStore.setState({ currentTime: 3 })
    await vi.advanceTimersByTimeAsync(THROTTLE_MS)
    expect(send).toHaveBeenCalledTimes(n)
  })

  it('ignores bridge failures', async () => {
    vi.mocked(window.api.discordGetEnabled).mockRejectedValueOnce(new Error('x'))
    stop = initDiscordPresence()
    await flush()
    setDiscordEnabled(true)
    await flush()
    vi.mocked(window.api.discordSetActivity).mockRejectedValueOnce(new Error('y'))
    play()
    await flush()
    expect(window.api.discordSetActivity).toHaveBeenCalled()
  })

  it('toggling on pushes the current state; cleanup stops pushes', async () => {
    stop = initDiscordPresence()
    await flush()
    play()
    await setDiscordEnabled(true)
    expect(window.api.discordSetEnabled).toHaveBeenCalledWith(true)
    await flush()
    expect(window.api.discordSetActivity).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(THROTTLE_MS)
    play('z')
    stop()
    stop = () => {}
    await vi.advanceTimersByTimeAsync(THROTTLE_MS)
    expect(window.api.discordSetActivity).toHaveBeenCalledTimes(1)
  })

  it('cleanup cancels a pending trailing push', async () => {
    vi.mocked(window.api.discordGetEnabled).mockResolvedValue(true)
    stop = initDiscordPresence()
    await flush()
    play('a')
    await flush()
    play('b')
    stop()
    stop = () => {}
    await vi.advanceTimersByTimeAsync(THROTTLE_MS)
    expect(window.api.discordSetActivity).toHaveBeenCalledTimes(1)
  })
})

describe('getDiscordEnabled', () => {
  it('reads the persisted flag', async () => {
    vi.mocked(window.api.discordGetEnabled).mockResolvedValueOnce(true)
    expect(await getDiscordEnabled()).toBe(true)
  })
})

describe('private session', () => {
  it('clears presence while a private session is on and restores it after', async () => {
    const { setPrivateSession } = await import('../stores/prefs/privacy')
    vi.mocked(window.api.discordGetEnabled).mockResolvedValue(true)
    play('a')
    stop = initDiscordPresence()
    await flush()
    expect(window.api.discordSetActivity).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Song' }))
    setPrivateSession(true)
    await vi.advanceTimersByTimeAsync(THROTTLE_MS)
    expect(window.api.discordSetActivity).toHaveBeenLastCalledWith(null)
    const calls = vi.mocked(window.api.discordSetActivity).mock.calls.length
    play('b')
    await vi.advanceTimersByTimeAsync(THROTTLE_MS * 2)
    expect(window.api.discordSetActivity).toHaveBeenCalledTimes(calls)
    setPrivateSession(false)
    await vi.advanceTimersByTimeAsync(THROTTLE_MS)
    expect(window.api.discordSetActivity).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Song' }))
  })
})
