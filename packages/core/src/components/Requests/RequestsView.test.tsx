import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import RequestsView from './RequestsView'
import * as social from '../../services/social'
import * as mb from '../../services/musicbrainz'
import { useToastStore } from '../../stores/toast'

const req = (over: Partial<social.AlbumRequest> = {}): social.AlbumRequest => ({
  id: 1, title: 'OK Computer', artist: 'Radiohead', year: '1997', mbReleaseId: null, coverUrl: null, note: 'please',
  status: 'pending', adminNote: null, requestedBy: { id: 'u1', name: 'Ana' }, createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z', votes: 1, votedByMe: false, voters: [{ id: 'u2', name: 'Bob' }], ...over,
})

function Loc() { const l = useLocation(); return <div data-testid="loc">{l.pathname + l.search}</div> }

const renderView = () => render(
  <MemoryRouter initialEntries={['/requests']}>
    <Routes><Route path="*" element={<><RequestsView /><Loc /></>} /></Routes>
  </MemoryRouter>
)

const toastSpy = vi.fn()

describe('RequestsView', () => {
  beforeEach(() => {
    useToastStore.setState({ show: toastSpy } as never)
    vi.spyOn(social, 'loadConfig').mockResolvedValue()
    vi.spyOn(social, 'isConfigured').mockReturnValue(true)
    vi.spyOn(social, 'getMe').mockResolvedValue({ id: 'u1', name: 'Ana', isAdmin: false })
    vi.spyOn(social, 'listRequests').mockResolvedValue([req()])
  })

  it('shows an empty state linking to settings when not configured', async () => {
    vi.mocked(social.isConfigured).mockReturnValue(false)
    renderView()
    fireEvent.click(await screen.findByRole('link', { name: 'Open settings' }))
    expect(screen.getByTestId('loc')).toHaveTextContent('/settings')
  })

  it('lists pending requests and toggles votes', async () => {
    const vote = vi.spyOn(social, 'vote').mockResolvedValue(req({ votes: 2, votedByMe: true }))
    renderView()
    expect(await screen.findByText('OK Computer')).toBeInTheDocument()
    expect(social.listRequests).toHaveBeenCalledWith('pending')
    expect(screen.getByText('please')).toBeInTheDocument()
    const btn = screen.getByRole('button', { name: 'Vote' })
    expect(btn).toHaveAttribute('title', 'Bob')
    fireEvent.click(btn)
    await waitFor(() => expect(vote).toHaveBeenCalledWith(1))
    expect(await screen.findByRole('button', { name: 'Remove vote' })).toHaveTextContent('2')
  })

  it('switches filter tab', async () => {
    renderView()
    await screen.findByText('OK Computer')
    fireEvent.click(screen.getByRole('tab', { name: 'All' }))
    await waitFor(() => expect(social.listRequests).toHaveBeenCalledWith(undefined))
  })

  it('lets the requester delete own pending request', async () => {
    const del = vi.spyOn(social, 'deleteRequest').mockResolvedValue()
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: 'Delete request' }))
    await waitFor(() => expect(del).toHaveBeenCalledWith(1))
    await waitFor(() => expect(screen.queryByText('OK Computer')).toBeNull())
    expect(toastSpy).toHaveBeenCalledWith('Request deleted', 'success')
  })

  it('shows a load error with retry', async () => {
    vi.mocked(social.listRequests).mockRejectedValueOnce(new Error('x'))
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('OK Computer')).toBeInTheDocument()
  })

  it('admin can approve, reject with note and search soulseek', async () => {
    vi.mocked(social.getMe).mockResolvedValue({ id: 'admin', name: 'Root', isAdmin: true })
    const update = vi.spyOn(social, 'updateRequest').mockResolvedValue(req({ status: 'approved' }))
    renderView()
    await screen.findByText('OK Computer')
    expect(screen.queryByRole('button', { name: 'Delete request' })).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith(1, { status: 'approved' }))
    await waitFor(() => expect(screen.queryByText('OK Computer')).toBeNull())

    vi.mocked(social.listRequests).mockResolvedValue([req({ status: 'approved' })])
    fireEvent.click(screen.getByRole('tab', { name: 'Approved' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    fireEvent.change(screen.getByPlaceholderText('Reason (optional)'), { target: { value: 'nope' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith(1, { status: 'rejected', adminNote: 'nope' }))

    fireEvent.click(screen.getByRole('tab', { name: 'Approved' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Search on Soulseek' }))
    expect(screen.getByTestId('loc')).toHaveTextContent('/soulseek?q=Radiohead%20OK%20Computer')
  })

  it('creates a request from a MusicBrainz result', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.spyOn(mb, 'searchReleases').mockResolvedValue([
      { id: 'mb1', title: 'Kid A', date: '2000-10-02', 'artist-credit': [{ name: 'Radiohead', artist: { id: 'a', name: 'Radiohead' } }] },
    ])
    const create = vi.spyOn(social, 'createRequest').mockResolvedValue(req({ id: 2, title: 'Kid A' }))
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: 'Request an album' }))
    fireEvent.change(screen.getByPlaceholderText('Search album or artist on MusicBrainz'), { target: { value: 'kid a' } })
    await vi.advanceTimersByTimeAsync(500)
    fireEvent.click(await screen.findByRole('button', { name: /Kid A/ }))
    fireEvent.change(screen.getByPlaceholderText('Note (optional)'), { target: { value: 'pls' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    await waitFor(() => expect(create).toHaveBeenCalledWith({
      title: 'Kid A', artist: 'Radiohead', year: '2000', mbReleaseId: 'mb1', coverUrl: mb.getCoverArtUrl('mb1', 250), note: 'pls',
    }))
    expect(toastSpy).toHaveBeenCalledWith('Request sent', 'success')
    vi.useRealTimers()
  })

  it('handles duplicates by highlighting the existing request', async () => {
    vi.spyOn(social, 'createRequest').mockRejectedValue(new social.DuplicateRequestError(req({ id: 9, title: 'Dup' })))
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: 'Request an album' }))
    fireEvent.change(screen.getByPlaceholderText('Album title'), { target: { value: 'Dup' } })
    fireEvent.change(screen.getByPlaceholderText('Artist'), { target: { value: 'X' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith('This album was already requested — vote for it instead', 'info'))
    const item = await screen.findByTestId('request-9')
    expect(within(item).getByText('Dup')).toBeInTheDocument()
    expect(item.className).toContain('ring-accent')
  })
})
