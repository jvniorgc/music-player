import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AlbumView from './AlbumView'
import ArtistView from './ArtistView'
import { jellyfin } from '../../services/jellyfin'
import { useAuthStore } from '../../stores/auth'
import { useLibraryStore } from '../../stores/library'

const album = { Id: 'al1', Name: 'Album', Type: 'MusicAlbum' }
const artist = { Id: 'ar1', Name: 'Artist', Type: 'MusicArtist' }

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/album/:id" element={<AlbumView />} />
      <Route path="/artist/:id" element={<ArtistView />} />
    </Routes>
  </MemoryRouter>
)

beforeEach(() => {
  useLibraryStore.setState({ fetchPlaylists: vi.fn(), playlists: [{ Id: 'p', Name: 'p', Type: 'Playlist' }] })
  vi.spyOn(jellyfin, 'getAlbumItems').mockResolvedValue({ Items: [], TotalRecordCount: 0 })
  vi.spyOn(jellyfin, 'getArtistAlbums').mockResolvedValue({ Items: [], TotalRecordCount: 0 })
  vi.spyOn(jellyfin, 'getArtistTopSongs').mockResolvedValue([])
  vi.spyOn(jellyfin, 'getItem').mockImplementation(async id => (id === 'al1' ? album : artist) as any)
})

describe.each([
  [false, 'hides'],
  [true, 'shows'],
])('metadata editor entry points (admin=%s)', (isAdmin, verb) => {
  beforeEach(() => useAuthStore.setState({ isAdmin }))

  it(`${verb} the album "Edit metadata" button`, async () => {
    renderAt('/album/al1')
    await screen.findByText('Album', { selector: 'h1' })
    expect(!!screen.queryByRole('button', { name: 'Edit metadata' })).toBe(isAdmin)
  })

  it(`${verb} the artist image buttons`, async () => {
    renderAt('/artist/ar1')
    await screen.findByText('Artist', { selector: 'h1' })
    expect(screen.queryAllByRole('button', { name: /image/i }).length > 0).toBe(isAdmin)
  })
})
