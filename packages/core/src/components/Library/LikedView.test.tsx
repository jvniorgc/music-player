import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LikedView from './LikedView'
import { jellyfin } from '../../services/jellyfin'
import { usePlayerStore } from '../../stores/player'
import { useDownloadStore } from '../../stores/download'
import { useToastStore } from '../../stores/toast'

const song = (id: string, name: string) => ({ Id: id, Name: name, Type: 'Audio', UserData: { IsFavorite: true } })

const renderView = () => render(<MemoryRouter><LikedView /></MemoryRouter>)

describe('LikedView', () => {
  beforeEach(() => {
    vi.spyOn(jellyfin, 'getImageUrl').mockReturnValue('img')
  })

  it('lists liked songs with a count and plays them in the liked context', async () => {
    vi.spyOn(jellyfin, 'getFavoriteSongs').mockResolvedValue({ Items: [song('a', 'One'), song('b', 'Two')], TotalRecordCount: 2 } as never)
    const playItems = vi.fn()
    const shuffleItems = vi.fn()
    usePlayerStore.setState({ playItems, shuffleItems } as never)
    renderView()

    expect(await screen.findByText('One')).toBeInTheDocument()
    expect(screen.getByText('2 songs')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(playItems).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ Id: 'a' })]), 0, { type: 'liked', name: 'Liked songs' })
    fireEvent.click(screen.getByRole('button', { name: 'Shuffle' }))
    expect(shuffleItems).toHaveBeenCalled()
  })

  it('downloads every song not yet downloaded', async () => {
    vi.spyOn(jellyfin, 'getFavoriteSongs').mockResolvedValue({ Items: [song('a', 'One'), song('b', 'Two')], TotalRecordCount: 2 } as never)
    const startDownload = vi.fn()
    useDownloadStore.setState({ startDownload, isDownloaded: (id: string) => id === 'a' } as never)
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: 'Download all' }))
    expect(startDownload).toHaveBeenCalledTimes(1)
    expect(startDownload).toHaveBeenCalledWith(expect.objectContaining({ Id: 'b' }))
  })

  it('removes a track from the list when it is unliked', async () => {
    vi.spyOn(jellyfin, 'getFavoriteSongs').mockResolvedValue({ Items: [song('a', 'One'), song('b', 'Two')], TotalRecordCount: 2 } as never)
    const toggle = vi.spyOn(jellyfin, 'toggleFavorite').mockResolvedValue()
    renderView()
    await screen.findByText('One')
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove from liked songs' })[0])
    await waitFor(() => expect(screen.queryByText('One')).toBeNull())
    expect(toggle).toHaveBeenCalledWith('a', true)
    expect(screen.getByText('Two')).toBeInTheDocument()
  })

  it('keeps the track and shows an error when unliking fails', async () => {
    vi.spyOn(jellyfin, 'getFavoriteSongs').mockResolvedValue({ Items: [song('a', 'One')], TotalRecordCount: 1 } as never)
    vi.spyOn(jellyfin, 'toggleFavorite').mockRejectedValue(new Error('x'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: 'Remove from liked songs' }))
    await waitFor(() => expect(useToastStore.getState().toasts.map(t => t.message)).toContain('Could not update liked songs'))
    expect(screen.getByText('One')).toBeInTheDocument()
  })

  it('shows an empty state when there are no liked songs (or loading fails)', async () => {
    vi.spyOn(jellyfin, 'getFavoriteSongs').mockRejectedValue(new Error('down'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    renderView()
    expect(await screen.findByText('Songs you like will appear here')).toBeInTheDocument()
  })

  it('hands the loaded liked songs to auto-download', async () => {
    const items = [song('a', 'One')]
    vi.spyOn(jellyfin, 'getFavoriteSongs').mockResolvedValue({ Items: items, TotalRecordCount: 1 } as never)
    const autoDownloadLiked = vi.fn().mockResolvedValue(undefined)
    useDownloadStore.setState({ autoDownloadLiked } as never)
    renderView()
    await screen.findByText('One')
    expect(autoDownloadLiked).toHaveBeenCalledWith(items)
  })
})
