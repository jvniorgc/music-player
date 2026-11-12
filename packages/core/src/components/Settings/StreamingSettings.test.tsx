import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StreamingSettings } from './StreamingSettings'
import { useStreamingPrefs } from '../../stores/prefs/streaming'
import { useDownloadStore } from '../../stores/download'
import { useToastStore } from '../../stores/toast'
import { jellyfin } from '../../services/jellyfin'

const GB = 1024 ** 3

describe('StreamingSettings', () => {
  beforeEach(() => {
    useStreamingPrefs.getState().reset()
    jellyfin.setAuth({ serverUrl: 'https://music.example.com', token: 't', userId: 'u', username: 'n', serverId: 's' })
  })

  it('edits local/remote streaming quality and the data saver', () => {
    render(<StreamingSettings />)
    expect(screen.getByText('Your server is reached over the internet.')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'On local network' }), { target: { value: '320' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'On remote connections' }), { target: { value: '96' } })
    fireEvent.click(screen.getByRole('switch', { name: 'Data saver' }))
    expect(useStreamingPrefs.getState().values).toMatchObject({ localQuality: '320', remoteQuality: '96', dataSaver: true })
    expect(screen.getByRole('switch', { name: 'Data saver' })).toHaveAttribute('aria-checked', 'true')
  })

  it('says when the server is local', () => {
    jellyfin.setAuth({ serverUrl: 'http://192.168.1.2:8096', token: 't', userId: 'u', username: 'n', serverId: 's' })
    render(<StreamingSettings />)
    expect(screen.getByText('Your server is on the local network.')).toBeInTheDocument()
  })

  it('shows cache usage and changes the limit', async () => {
    vi.mocked(window.api.getCacheInfo).mockResolvedValueOnce({ usedBytes: 5 * 1024 * 1024, limitBytes: 2 * GB })
      .mockResolvedValueOnce({ usedBytes: 1024 * 1024, limitBytes: 512 * 1024 ** 2 })
    render(<StreamingSettings />)
    expect(await screen.findByText('5.0 MB of 2 GB used')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Audio cache size limit' }), { target: { value: String(512 * 1024 ** 2) } })
    expect(window.api.setCacheLimit).toHaveBeenCalledWith(512 * 1024 ** 2)
    expect(await screen.findByText('1.0 MB of 512 MB used')).toBeInTheDocument()
  })

  it('toasts when the cache limit cannot be changed', async () => {
    const show = vi.fn()
    useToastStore.setState({ show } as never)
    vi.mocked(window.api.setCacheLimit).mockRejectedValueOnce(new Error('x'))
    render(<StreamingSettings />)
    fireEvent.change(await screen.findByRole('combobox', { name: 'Audio cache size limit' }), { target: { value: String(GB) } })
    await waitFor(() => expect(show).toHaveBeenCalledWith('Could not change the cache limit', 'error'))
  })

  it('shows, changes and opens the downloads folder', async () => {
    vi.mocked(window.api.chooseDownloadsDir).mockResolvedValueOnce(null).mockResolvedValueOnce('/music/new')
    render(<StreamingSettings />)
    expect(await screen.findByText('/data/downloads')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Change…' }))
    await waitFor(() => expect(window.api.chooseDownloadsDir).toHaveBeenCalledTimes(1))
    expect(screen.getByText('/data/downloads')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Change…' }))
    expect(await screen.findByText('/music/new')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }))
    expect(window.api.openDownloadsDir).toHaveBeenCalled()
  })

  it('toasts when the folder picker or opener fails', async () => {
    const show = vi.fn()
    useToastStore.setState({ show } as never)
    vi.mocked(window.api.chooseDownloadsDir).mockRejectedValueOnce(new Error('x'))
    vi.mocked(window.api.openDownloadsDir).mockRejectedValueOnce(new Error('x'))
    render(<StreamingSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Change…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }))
    await waitFor(() => expect(show).toHaveBeenCalledTimes(2))
    expect(show).toHaveBeenCalledWith('Could not access the downloads folder', 'error')
  })

  it('sets download quality and starts syncing liked songs when auto-download is enabled', () => {
    const syncLikedDownloads = vi.fn().mockResolvedValue(undefined)
    useDownloadStore.setState({ syncLikedDownloads } as never)
    render(<StreamingSettings />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Download quality' }), { target: { value: 'aac-256' } })
    expect(useStreamingPrefs.getState().values.downloadQuality).toBe('aac-256')
    const toggle = screen.getByRole('switch', { name: 'Automatically download liked songs' })
    fireEvent.click(toggle)
    expect(useStreamingPrefs.getState().values.autoDownloadLiked).toBe(true)
    expect(syncLikedDownloads).toHaveBeenCalledTimes(1)
    fireEvent.click(toggle)
    expect(useStreamingPrefs.getState().values.autoDownloadLiked).toBe(false)
    expect(syncLikedDownloads).toHaveBeenCalledTimes(1)
  })
})
