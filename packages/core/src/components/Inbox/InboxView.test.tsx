import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import InboxView from './InboxView'
import RecommendModal from './RecommendModal'
import * as social from '../../services/social'
import * as recs from '../../services/friendRecs'
import { jellyfin } from '../../services/jellyfin'
import { useToastStore } from '../../stores/toast'
import { usePlayerStore } from '../../stores/player'
import { useInboxStore } from '../../stores/inbox'

const rec = (over: Partial<recs.FriendRec> = {}): recs.FriendRec => ({
  id: 1, from: { id: 'bia', name: 'Bia' }, toUserId: 'ana', toUserName: 'Ana',
  item: { type: 'track', id: 't1', name: 'Song', artist: 'Band', albumId: 'al' },
  message: 'ouve isso', createdAt: '2026-01-01T00:00:00Z', listenedAt: null, reaction: null, ...over,
})

function Loc() { const l = useLocation(); return <div data-testid="loc">{l.pathname}</div> }
const renderView = () => render(
  <MemoryRouter initialEntries={['/inbox']}>
    <Routes><Route path="*" element={<><InboxView /><Loc /></>} /></Routes>
  </MemoryRouter>
)
const toastSpy = vi.fn()

beforeEach(() => {
  useToastStore.setState({ show: toastSpy } as never)
  useInboxStore.setState({ configured: false, unread: 0, pending: null })
  vi.spyOn(social, 'loadConfig').mockResolvedValue()
  vi.spyOn(social, 'autoDetect').mockResolvedValue(false)
  vi.spyOn(social, 'isConfigured').mockReturnValue(true)
  vi.spyOn(recs, 'getInbox').mockResolvedValue([rec()])
  vi.spyOn(recs, 'getSent').mockResolvedValue([rec({ id: 2, listenedAt: '2026-01-02', reaction: 'love', item: { type: 'album', id: 'al', name: 'Alb' } })])
  vi.spyOn(recs, 'getUnreadCount').mockResolvedValue(0)
})

describe('InboxView', () => {
  it('links to settings when not configured', async () => {
    vi.mocked(social.isConfigured).mockReturnValue(false)
    renderView()
    expect(await screen.findByRole('link', { name: 'Open settings' })).toBeInTheDocument()
  })

  it('lists received items, plays tracks, marks listened, reacts and dismisses', async () => {
    vi.spyOn(jellyfin, 'getItem').mockResolvedValue({ Id: 't1' } as never)
    const playItems = vi.fn()
    usePlayerStore.setState({ playItems })
    vi.spyOn(recs, 'markListened').mockResolvedValue(rec({ listenedAt: 'x' }))
    vi.spyOn(recs, 'setReaction').mockResolvedValue(rec({ reaction: 'like' }))
    vi.spyOn(recs, 'deleteRecommendation').mockResolvedValue()
    renderView()
    expect(await screen.findByText('Song')).toBeInTheDocument()
    expect(screen.getByText('From Bia', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('New')).toBeInTheDocument()
    expect(useInboxStore.getState().configured).toBe(true)
    fireEvent.click(screen.getByText('Song'))
    await waitFor(() => expect(playItems).toHaveBeenCalledWith([{ Id: 't1' }], 0))
    fireEvent.click(screen.getByRole('button', { name: 'Mark as listened' }))
    await waitFor(() => expect(screen.queryByText('New')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Like' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Like' })).toHaveAttribute('aria-pressed', 'true'))
    fireEvent.click(screen.getByRole('button', { name: 'Like' }))
    expect(recs.setReaction).toHaveBeenLastCalledWith(1, null)
    fireEvent.click(screen.getByRole('button', { name: 'Love' }))
    expect(recs.setReaction).toHaveBeenLastCalledWith(1, 'love')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(await screen.findByText('No recommendations yet')).toBeInTheDocument()
  })

  it('shows sent items and navigates to albums/artists', async () => {
    renderView()
    fireEvent.click(await screen.findByRole('tab', { name: 'Sent' }))
    expect(await screen.findByText('Alb')).toBeInTheDocument()
    expect(screen.getByText('Listened')).toBeInTheDocument()
    expect(screen.getByLabelText('Love')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Alb'))
    expect(screen.getByTestId('loc')).toHaveTextContent('/album/al')
  })

  it('navigates to artists and reports errors', async () => {
    vi.mocked(recs.getInbox).mockResolvedValueOnce([rec({ item: { type: 'artist', id: 'ar', name: 'Art' } }), rec({ id: 3 })])
    vi.spyOn(jellyfin, 'getItem').mockRejectedValue(new Error('x'))
    vi.spyOn(recs, 'markListened').mockRejectedValue(new Error('x'))
    renderView()
    fireEvent.click(await screen.findByText('Song'))
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith("Couldn't play this item", 'error'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Mark as listened' })[0])
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith('Something went wrong', 'error'))
    fireEvent.click(screen.getByText('Art'))
    expect(screen.getByTestId('loc')).toHaveTextContent('/artist/ar')
  })

  it('shows an error with retry', async () => {
    vi.mocked(recs.getInbox).mockRejectedValueOnce(new Error('x'))
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Song')).toBeInTheDocument()
  })
})

describe('RecommendModal', () => {
  const item = { type: 'track' as const, id: 't1', name: 'Song' }
  beforeEach(() => {
    jellyfin.setAuth({ serverUrl: 'http://jf', token: 't', userId: 'ana', username: 'ana', serverId: 's' } as never)
    vi.spyOn(social, 'listUsers').mockResolvedValue([
      { id: 'ana', name: 'Ana', lastSeen: '' }, { id: 'bia', name: 'Bia', lastSeen: '' }, { id: 'joao', name: 'João', lastSeen: '' },
    ])
  })

  it('sends to selected friends (excluding self) with a message', async () => {
    vi.spyOn(recs, 'sendRecommendation').mockResolvedValue([rec(), rec()])
    const onClose = vi.fn()
    render(<RecommendModal item={item} onClose={onClose} />)
    expect(await screen.findByLabelText('Bia')).toBeInTheDocument()
    expect(screen.queryByLabelText('Ana')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    fireEvent.click(screen.getByLabelText('Bia'))
    fireEvent.click(screen.getByLabelText('João'))
    fireEvent.click(screen.getByLabelText('Bia'))
    fireEvent.click(screen.getByLabelText('Bia'))
    fireEvent.change(screen.getByLabelText('Add a message (optional)'), { target: { value: ' hey ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(recs.sendRecommendation).toHaveBeenCalledWith(['joao', 'bia'], item, 'hey')
    expect(toastSpy).toHaveBeenCalledWith('Sent to 2 friends', 'success')
  })

  it('handles send failures, empty and failing friend lists', async () => {
    vi.spyOn(recs, 'sendRecommendation').mockRejectedValue(new Error('x'))
    const { unmount } = render(<RecommendModal item={item} onClose={vi.fn()} />)
    fireEvent.click(await screen.findByLabelText('Bia'))
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith("Couldn't send the recommendation", 'error'))
    unmount()
    vi.mocked(social.listUsers).mockResolvedValueOnce([])
    const r2 = render(<RecommendModal item={item} onClose={vi.fn()} />)
    expect(await screen.findByText('No friends have used the app yet')).toBeInTheDocument()
    r2.unmount()
    vi.mocked(social.listUsers).mockRejectedValueOnce(new Error('x'))
    render(<RecommendModal item={item} onClose={vi.fn()} />)
    expect(await screen.findByText("Couldn't load friends")).toBeInTheDocument()
  })

  it('renders nothing without an item', () => {
    render(<RecommendModal item={null} onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument()
  })
})
