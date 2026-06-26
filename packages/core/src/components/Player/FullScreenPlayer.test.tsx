import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import FullScreenPlayer from './FullScreenPlayer'
import { usePlayerStore } from '../../stores/player'
import { jellyfin } from '../../services/jellyfin'
import type { QueueTrack } from '../../services/playback'

function makeTrack(): QueueTrack {
  return {
    id: 's1',
    item: { Id: 's1', Name: 'Song', Type: 'Audio', AlbumId: 'a1', ImageTags: { Primary: 'p' } },
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
})
