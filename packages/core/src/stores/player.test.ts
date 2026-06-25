import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../services/playback', () => ({
  playback: {
    volume: 1,
    userQueue: [] as unknown[],
    contextUpNext: [] as unknown[],
    contextName: '',
    setQueue: vi.fn(),
    addToQueue: vi.fn(),
    addNext: vi.fn(),
    removeFromUserQueue: vi.fn(),
    removeFromContext: vi.fn(),
    playUserQueueAt: vi.fn(),
    playContextAt: vi.fn(),
    clearQueue: vi.fn(),
    togglePlay: vi.fn(),
    next: vi.fn(),
    previous: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    toggleShuffle: vi.fn(),
    toggleRepeat: vi.fn(),
    on: vi.fn().mockReturnValue(() => {}),
  },
}))

vi.mock('../services/jellyfin', () => ({
  jellyfin: { getImageUrl: (id: string) => `img://${id}` },
}))

import { usePlayerStore } from './player'
import { playback } from '../services/playback'

const INITIAL = {
  currentTrack: null, userQueue: [], contextUpNext: [], contextName: '',
  isPlaying: false, isBuffering: false, currentTime: 0, duration: 0, volume: 1,
  shuffle: false, repeat: 'none' as const, showFullScreen: false, showQueue: false,
}

beforeEach(() => {
  usePlayerStore.setState(INITIAL)
  ;(playback as { userQueue: unknown[] }).userQueue = []
  ;(playback as { contextUpNext: unknown[] }).contextUpNext = []
  ;(playback as { contextName: string }).contextName = ''
})

describe('delegation to the playback engine', () => {
  it('forwards queue and transport actions', () => {
    const items = [{ Id: 't0', Name: 'T0', Type: 'Audio' }]
    usePlayerStore.getState().playItems(items, 0, 'Album')
    expect(playback.setQueue).toHaveBeenCalledWith(items, 0, 'Album')

    usePlayerStore.getState().addToQueue(items[0])
    expect(playback.addToQueue).toHaveBeenCalledWith(items[0])

    usePlayerStore.getState().addNext(items[0])
    expect(playback.addNext).toHaveBeenCalledWith(items[0])

    usePlayerStore.getState().removeFromUserQueue(2)
    expect(playback.removeFromUserQueue).toHaveBeenCalledWith(2)

    usePlayerStore.getState().removeFromContext(1)
    expect(playback.removeFromContext).toHaveBeenCalledWith(1)

    usePlayerStore.getState().playUserQueueAt(0)
    expect(playback.playUserQueueAt).toHaveBeenCalledWith(0)

    usePlayerStore.getState().playContextAt(3)
    expect(playback.playContextAt).toHaveBeenCalledWith(3)

    usePlayerStore.getState().clearQueue()
    expect(playback.clearQueue).toHaveBeenCalled()

    usePlayerStore.getState().togglePlay()
    expect(playback.togglePlay).toHaveBeenCalled()

    usePlayerStore.getState().next()
    usePlayerStore.getState().previous()
    expect(playback.next).toHaveBeenCalled()
    expect(playback.previous).toHaveBeenCalled()

    usePlayerStore.getState().seek(12)
    expect(playback.seek).toHaveBeenCalledWith(12)

    usePlayerStore.getState().toggleShuffle()
    usePlayerStore.getState().toggleRepeat()
    expect(playback.toggleShuffle).toHaveBeenCalled()
    expect(playback.toggleRepeat).toHaveBeenCalled()
  })

  it('setVolume delegates and mirrors the value into store state', () => {
    usePlayerStore.getState().setVolume(0.3)
    expect(playback.setVolume).toHaveBeenCalledWith(0.3)
    expect(usePlayerStore.getState().volume).toBe(0.3)
  })

  it('UI toggles update store state', () => {
    usePlayerStore.getState().setShowFullScreen(true)
    usePlayerStore.getState().setShowQueue(true)
    const s = usePlayerStore.getState()
    expect(s.showFullScreen).toBe(true)
    expect(s.showQueue).toBe(true)
  })
})

describe('initListeners event mapping', () => {
  it('maps playback events onto store state and returns the unsubscribe', () => {
    const unsub = usePlayerStore.getState().initListeners()
    const listener = vi.mocked(playback.on).mock.calls[0][0]

    listener('playing')
    expect(usePlayerStore.getState().isPlaying).toBe(true)
    listener('pause')
    expect(usePlayerStore.getState().isPlaying).toBe(false)

    listener('buffering', true)
    expect(usePlayerStore.getState().isBuffering).toBe(true)

    listener('shufflechange', true)
    expect(usePlayerStore.getState().shuffle).toBe(true)

    listener('repeatchange', 'all')
    expect(usePlayerStore.getState().repeat).toBe('all')

    listener('volumechange', 0.6)
    expect(usePlayerStore.getState().volume).toBe(0.6)

    listener('timeupdate', { currentTime: 5, duration: 10 })
    expect(usePlayerStore.getState().currentTime).toBe(5)
    expect(usePlayerStore.getState().duration).toBe(10)

    const track = { id: 't0', item: { Id: 't0', Name: 'T0', Type: 'Audio' } }
    listener('trackchange', track)
    expect(usePlayerStore.getState().currentTrack).toEqual(track)

    listener('queueend')
    expect(usePlayerStore.getState().isPlaying).toBe(false)

    expect(typeof unsub).toBe('function')
  })

  it('syncs both queue lists from the engine on queuechange and trackchange', () => {
    ;(playback as { userQueue: unknown[] }).userQueue = [{ id: 'a', item: { Id: 'a', Name: 'A', Type: 'Audio' } }]
    ;(playback as { contextUpNext: unknown[] }).contextUpNext = [{ id: 'c', item: { Id: 'c', Name: 'C', Type: 'Audio' } }]
    ;(playback as { contextName: string }).contextName = 'Disc'

    usePlayerStore.getState().initListeners()
    const listener = vi.mocked(playback.on).mock.calls.at(-1)![0]

    listener('queuechange')
    const s = usePlayerStore.getState()
    expect(s.userQueue).toEqual([{ id: 'a', item: { Id: 'a', Name: 'A', Type: 'Audio' } }])
    expect(s.contextUpNext).toEqual([{ id: 'c', item: { Id: 'c', Name: 'C', Type: 'Audio' } }])
    expect(s.contextName).toBe('Disc')
  })

  it('registers media-session controls and maps metadata/position updates', () => {
    const mediaSession = {
      setActionHandler: vi.fn(),
      setPositionState: vi.fn(),
      metadata: null as unknown,
      playbackState: 'none',
    }
    Object.defineProperty(navigator, 'mediaSession', { value: mediaSession, configurable: true, writable: true })
    vi.stubGlobal('MediaMetadata', class { constructor(init: Record<string, unknown>) { Object.assign(this, init) } })

    usePlayerStore.getState().initListeners()
    expect(mediaSession.setActionHandler).toHaveBeenCalledWith('play', expect.any(Function))
    expect(mediaSession.setActionHandler).toHaveBeenCalledWith('nexttrack', expect.any(Function))

    // Invoke each registered OS media-control handler to exercise their bodies.
    const actions = Object.fromEntries(mediaSession.setActionHandler.mock.calls) as Record<string, (d?: any) => void>
    actions.play()
    actions.pause()
    expect(playback.togglePlay).toHaveBeenCalledTimes(2)
    actions.previoustrack()
    expect(playback.previous).toHaveBeenCalled()
    actions.nexttrack()
    expect(playback.next).toHaveBeenCalled()
    actions.seekto({ seekTime: 30 })
    expect(playback.seek).toHaveBeenCalledWith(30)
    actions.seekto({ seekTime: null }) // no seekTime -> seek not called again
    expect(playback.seek).toHaveBeenCalledTimes(1)

    const listener = vi.mocked(playback.on).mock.calls.at(-1)![0]

    listener('trackchange', { id: 't0', item: { Id: 't0', Name: 'Song', AlbumId: 'al1', Type: 'Audio' } })
    expect(mediaSession.metadata).toBeTruthy()

    // Artwork falls back to the item Id; artist/album come from their fields.
    listener('trackchange', { id: 't1', item: { Id: 't1', Name: 'Song2', Artists: ['A', 'B'], Album: 'Disc', ImageTags: { Primary: 'tag1' }, Type: 'Audio' } })
    expect((mediaSession.metadata as any).artist).toBe('A, B')
    expect((mediaSession.metadata as any).album).toBe('Disc')

    // No AlbumId/Id and no artist info -> no artwork, empty artist string.
    listener('trackchange', { id: 't2', item: { Id: '', Name: 'Song3', AlbumArtist: 'Solo', Type: 'Audio' } })
    expect((mediaSession.metadata as any).artist).toBe('Solo')
    expect((mediaSession.metadata as any).artwork).toBeUndefined()

    // playing/pause drive the OS playback state.
    listener('playing')
    expect(mediaSession.playbackState).toBe('playing')
    listener('pause')
    expect(mediaSession.playbackState).toBe('paused')

    listener('timeupdate', { currentTime: 5, duration: 10 })
    expect(mediaSession.setPositionState).toHaveBeenCalledWith({ duration: 10, position: 5, playbackRate: 1 })

    delete (navigator as { mediaSession?: unknown }).mediaSession
    vi.unstubAllGlobals()
  })
})
