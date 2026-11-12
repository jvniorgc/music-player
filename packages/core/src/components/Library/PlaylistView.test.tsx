import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PlaylistView from './PlaylistView'
import { jellyfin } from '../../services/jellyfin'

const playlist = { Id: 'pl1', Name: 'Mix', Type: 'Playlist', ImageTags: { Primary: 'old' }, Tags: ['mp-owner:u1'] }

const renderView = () => render(
  <MemoryRouter initialEntries={['/playlist/pl1']}>
    <Routes><Route path="/playlist/:id" element={<PlaylistView />} /></Routes>
  </MemoryRouter>
)

describe('PlaylistView cover image', () => {
  beforeEach(() => {
    vi.spyOn(jellyfin, 'getPlaylistItems').mockResolvedValue({ Items: [], TotalRecordCount: 0 })
    vi.spyOn(jellyfin, 'getItem').mockResolvedValue(playlist)
    vi.spyOn(jellyfin, 'getPlaylists').mockResolvedValue({ Items: [], TotalRecordCount: 0 })
    vi.spyOn(jellyfin, 'getImageUrl').mockImplementation((id, tag) => `img/${id}/${tag}`)
  })

  it('lets the owner upload a new cover', async () => {
    vi.spyOn(jellyfin, 'isPlaylistOwner').mockResolvedValue(true)
    const upload = vi.spyOn(jellyfin, 'uploadImageBlob').mockResolvedValue()
    vi.mocked(jellyfin.getItem).mockResolvedValueOnce(playlist).mockResolvedValueOnce({ ...playlist, ImageTags: { Primary: 'new' } })
    renderView()

    const button = await screen.findByRole('button', { name: 'Change cover' })
    expect(jellyfin.isPlaylistOwner).toHaveBeenCalledWith('pl1', ['mp-owner:u1'])
    fireEvent.click(button)
    const file = new File(['x'], 'cover.png', { type: 'image/png' })
    fireEvent.change(screen.getByTestId('playlist-cover-input'), { target: { files: [file] } })

    await waitFor(() => expect(upload).toHaveBeenCalledWith('pl1', file))
    await waitFor(() => expect(screen.getByAltText('')).toHaveAttribute('src', 'img/pl1/new'))
  })

  it('hides the cover button for playlists the user does not own', async () => {
    vi.spyOn(jellyfin, 'isPlaylistOwner').mockResolvedValue(false)
    renderView()
    await screen.findByText('Mix')
    await waitFor(() => expect(jellyfin.isPlaylistOwner).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Change cover' })).toBeNull()
  })
})
