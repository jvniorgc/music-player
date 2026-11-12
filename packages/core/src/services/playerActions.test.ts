import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePlayerStore } from '../stores/player'
import { runPlayerAction } from './playerActions'
import { useLikesStore } from '../stores/likes'

const fns = {
  togglePlay: vi.fn(), next: vi.fn(), previous: vi.fn(), seek: vi.fn(),
  setVolume: vi.fn((v: number) => usePlayerStore.setState({ volume: v })), toggleShuffle: vi.fn(), toggleRepeat: vi.fn(),
}

beforeEach(() => {
  usePlayerStore.setState({ ...fns, volume: 0.5, currentTime: 5, duration: 100 } as any)
})

describe('runPlayerAction', () => {
  it('dispatches transport actions', () => {
    runPlayerAction('togglePlay'); runPlayerAction('next'); runPlayerAction('previous')
    runPlayerAction('shuffle'); runPlayerAction('repeat')
    expect(fns.togglePlay).toHaveBeenCalled()
    expect(fns.next).toHaveBeenCalled()
    expect(fns.previous).toHaveBeenCalled()
    expect(fns.toggleShuffle).toHaveBeenCalled()
    expect(fns.toggleRepeat).toHaveBeenCalled()
  })

  it('toggles the like of the current track, if any', () => {
    const toggle = vi.fn().mockResolvedValue(true)
    useLikesStore.setState({ toggle })
    usePlayerStore.setState({ currentTrack: null })
    runPlayerAction('toggleLike')
    expect(toggle).not.toHaveBeenCalled()
    usePlayerStore.setState({ currentTrack: { id: 't1', item: { Id: 't1' } } } as any)
    runPlayerAction('toggleLike')
    expect(toggle).toHaveBeenCalledWith('t1')
  })

  it('seeks within bounds', () => {
    runPlayerAction('seekBack')
    expect(fns.seek).toHaveBeenLastCalledWith(0)
    runPlayerAction('seekForward')
    expect(fns.seek).toHaveBeenLastCalledWith(15)
    usePlayerStore.setState({ currentTime: 95, duration: 0 })
    runPlayerAction('seekForward')
    expect(fns.seek).toHaveBeenLastCalledWith(105)
  })

  it('steps and clamps volume', () => {
    runPlayerAction('volumeUp')
    expect(fns.setVolume).toHaveBeenLastCalledWith(0.6)
    usePlayerStore.setState({ volume: 0.05 })
    runPlayerAction('volumeDown')
    expect(fns.setVolume).toHaveBeenLastCalledWith(0)
  })

  it('mutes and restores the previous volume', () => {
    runPlayerAction('mute')
    expect(fns.setVolume).toHaveBeenLastCalledWith(0)
    runPlayerAction('mute')
    expect(fns.setVolume).toHaveBeenLastCalledWith(0.5)
  })
})
