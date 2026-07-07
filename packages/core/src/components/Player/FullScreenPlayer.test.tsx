import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import FullScreenPlayer from './FullScreenPlayer'
import { usePlayerStore } from '../../stores/player'
import { jellyfin } from '../../services/jellyfin'
import type { QueueTrack } from '../../services/playback'

function makeTrack(id = 's1', name = 'Song'): QueueTrack {
  return {
    id,
    item: { Id: id, Name: name, Type: 'Audio', AlbumId: 'a1', ImageTags: { Primary: 'p' } },
  }
}

function renderPlayer() {
  return render(
    <MemoryRouter>
      <FullScreenPlayer />
    </MemoryRouter>
  )
}

beforeEach(() => {
  usePlayerStore.setState({ currentTrack: makeTrack() })
  vi.spyOn(jellyfin, 'getImageUrl').mockReturnValue('http://img/x.jpg')
})

afterEach(() => {
  cleanup()
  usePlayerStore.setState({ currentTrack: null })
})

describe('FullScreenPlayer lyrics visibility', () => {
  it('shows the lyrics panel when the current track has lyrics', async () => {
    vi.spyOn(jellyfin, 'getLyricsWithCache').mockResolvedValue([{ Text: 'first line' }])
    renderPlayer()
    expect(await screen.findByText('first line')).toBeInTheDocument()
    expect(screen.getByLabelText('Toggle lyrics')).toBeInTheDocument()
  })

  it('hides the lyrics when the toggle is clicked and shows them again on a second click', async () => {
    vi.spyOn(jellyfin, 'getLyricsWithCache').mockResolvedValue([{ Text: 'first line' }])
    renderPlayer()
    await screen.findByText('first line')

    fireEvent.click(screen.getByLabelText('Toggle lyrics'))
    expect(screen.queryByText('first line')).not.toBeInTheDocument()
    // Toggle stays available so lyrics can be restored.
    expect(screen.getByLabelText('Toggle lyrics')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Toggle lyrics'))
    expect(screen.getByText('first line')).toBeInTheDocument()
  })

  it('does not render a lyrics toggle when the track has no lyrics', async () => {
    vi.spyOn(jellyfin, 'getLyricsWithCache').mockResolvedValue([])
    renderPlayer()
    await waitFor(() => expect(jellyfin.getLyricsWithCache).toHaveBeenCalled())
    expect(screen.queryByLabelText('Toggle lyrics')).not.toBeInTheDocument()
  })

  it('ignores lyrics from a previous track that resolve after skipping to the next one', async () => {
    const resolvers = new Map<string, (lines: { Text: string }[]) => void>()
    vi.spyOn(jellyfin, 'getLyricsWithCache').mockImplementation(
      (id: string) => new Promise(resolve => resolvers.set(id, resolve))
    )
    renderPlayer()
    await waitFor(() => expect(resolvers.has('s1')).toBe(true))

    // Skip to the next track before the first track's lyrics arrive.
    usePlayerStore.setState({ currentTrack: makeTrack('s2', 'Next Song') })
    await waitFor(() => expect(resolvers.has('s2')).toBe(true))

    // The new track's lyrics arrive first, then the stale response for s1
    // resolves late — it must be discarded.
    resolvers.get('s2')!([{ Text: 'fresh lyrics from s2' }])
    await screen.findByText('fresh lyrics from s2')
    resolvers.get('s1')!([{ Text: 'stale lyrics from s1' }])

    await waitFor(() =>
      expect(screen.queryByText('stale lyrics from s1')).not.toBeInTheDocument()
    )
    expect(screen.getByText('fresh lyrics from s2')).toBeInTheDocument()
  })
})

describe('FullScreenPlayer responsive layout', () => {
  it('scales the album art with the viewport height so controls stay visible on small windows', async () => {
    vi.spyOn(jellyfin, 'getLyricsWithCache').mockResolvedValue([])
    renderPlayer()
    const art = await screen.findByTestId('album-art')
    // Fluid size capped at 18rem: shrinks with the window instead of overflowing
    expect(art.className).toContain('w-[min(18rem,35vh)]')
    expect(art.className).toContain('aspect-square')
  })

  it('hides the lyrics panel on narrow windows so the player controls keep their space', async () => {
    vi.spyOn(jellyfin, 'getLyricsWithCache').mockResolvedValue([{ Text: 'first line' }])
    renderPlayer()
    await screen.findByText('first line')
    const panel = screen.getByTestId('lyrics-panel')
    expect(panel.className).toContain('hidden')
    expect(panel.className).toContain('md:block')
  })
})
