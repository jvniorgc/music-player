import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import { ItemSocialPanel, AlbumSocialSection, TrackReactionsButton, ReactionBadge, useReactionSummary } from './ItemSocial'
import * as social from '../../services/social'
import * as reactions from '../../services/reactions'
import { useToastStore } from '../../stores/toast'

const comment = (over: Partial<reactions.ItemComment> = {}): reactions.ItemComment => ({
  id: 1, itemId: 't1', itemType: 'track', user: { id: 'u2', name: 'Bia' }, body: 'great drop',
  positionSeconds: 65, createdAt: '2026-01-01T00:00:00Z', ...over,
})
const data = (): reactions.ItemSocial => ({
  reactions: [{ emoji: '🔥', count: 2, mine: true, users: ['Ana', 'Bia'] }],
  comments: [comment(), comment({ id: 2, user: { id: 'u1', name: 'Ana' }, body: 'mine', positionSeconds: null })],
})
const toastSpy = vi.fn()

beforeEach(() => {
  useToastStore.setState({ show: toastSpy } as never)
  vi.spyOn(social, 'loadConfig').mockResolvedValue()
  vi.spyOn(social, 'autoDetect').mockResolvedValue(false)
  vi.spyOn(social, 'isConfigured').mockReturnValue(true)
  vi.spyOn(social, 'getMe').mockResolvedValue({ id: 'u1', name: 'Ana', isAdmin: false })
  vi.spyOn(reactions, 'getSocial').mockResolvedValue(data())
})

describe('ItemSocialPanel', () => {
  it('renders reactions with counts and comments, delete only on own', async () => {
    render(<ItemSocialPanel itemId="t1" itemType="track" />)
    const fire = await screen.findByRole('button', { name: 'React with 🔥' })
    expect(fire).toHaveTextContent('2')
    expect(fire).toHaveAttribute('aria-pressed', 'true')
    expect(fire).toHaveAttribute('title', 'Ana, Bia')
    expect(screen.getByRole('button', { name: 'React with 😂' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('great drop')).toBeInTheDocument()
    expect(screen.getByText('1:05')).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Delete comment' })).toHaveLength(1))
  })

  it('admins can delete any comment; seeking from timestamps', async () => {
    vi.mocked(social.getMe).mockResolvedValue({ id: 'adm', name: 'Adm', isAdmin: true })
    const onSeek = vi.fn()
    render(<ItemSocialPanel itemId="t1" itemType="track" onSeek={onSeek} />)
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Delete comment' })).toHaveLength(2))
    fireEvent.click(screen.getByText('1:05'))
    expect(onSeek).toHaveBeenCalledWith(65)
  })

  it('toggles a reaction and shows the server state', async () => {
    const after = { ...data(), reactions: [{ emoji: '🔥', count: 1, mine: false, users: ['Bia'] }] }
    vi.spyOn(reactions, 'setReaction').mockResolvedValue(after)
    render(<ItemSocialPanel itemId="t1" itemType="album" />)
    fireEvent.click(await screen.findByRole('button', { name: 'React with 🔥' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'React with 🔥' })).toHaveAttribute('aria-pressed', 'false'))
    expect(reactions.setReaction).toHaveBeenCalledWith('t1', 'album', '🔥', false)
    vi.mocked(reactions.setReaction).mockRejectedValueOnce(new Error('x'))
    fireEvent.click(screen.getByRole('button', { name: 'React with 😮' }))
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith("Couldn't save, try again", 'error'))
  })

  it('posts a comment with the current position, and deletes', async () => {
    vi.spyOn(reactions, 'addComment').mockResolvedValue(comment({ id: 9, body: 'new one', user: { id: 'u1', name: 'Ana' } }))
    vi.spyOn(reactions, 'deleteComment').mockResolvedValue()
    render(<ItemSocialPanel itemId="t1" itemType="track" getPosition={() => 42.9} />)
    const input = await screen.findByPlaceholderText('Add a comment…')
    expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled()
    fireEvent.change(input, { target: { value: ' new one ' } })
    fireEvent.click(screen.getByLabelText('At 0:42'))
    fireEvent.submit(input.closest('form')!)
    expect(await screen.findByText('new one')).toBeInTheDocument()
    expect(reactions.addComment).toHaveBeenCalledWith('t1', 'track', 'new one', 42)
    expect(input).toHaveValue('')
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Delete comment' }).length).toBeGreaterThan(0))
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete comment' })[0])
    await waitFor(() => expect(screen.queryByText('mine')).not.toBeInTheDocument())
    expect(reactions.deleteComment).toHaveBeenCalledWith(2)
  })

  it('posts without timestamp by default and toasts on failures', async () => {
    vi.spyOn(reactions, 'addComment').mockRejectedValue(new Error('x'))
    vi.spyOn(reactions, 'deleteComment').mockRejectedValue(new Error('x'))
    render(<ItemSocialPanel itemId="t1" itemType="album" />)
    const input = await screen.findByPlaceholderText('Add a comment…')
    fireEvent.change(input, { target: { value: 'hey' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    await waitFor(() => expect(toastSpy).toHaveBeenCalledTimes(1))
    expect(reactions.addComment).toHaveBeenCalledWith('t1', 'album', 'hey', undefined)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete comment' }))
    await waitFor(() => expect(toastSpy).toHaveBeenCalledTimes(2))
  })

  it('shows empty and error states', async () => {
    vi.mocked(reactions.getSocial).mockResolvedValueOnce({ reactions: [], comments: [] })
    vi.mocked(social.getMe).mockRejectedValueOnce(new Error('x'))
    const { unmount } = render(<ItemSocialPanel itemId="t1" itemType="track" />)
    expect(await screen.findByText('No comments yet')).toBeInTheDocument()
    unmount()
    vi.mocked(reactions.getSocial).mockRejectedValueOnce(new Error('x'))
    render(<ItemSocialPanel itemId="t2" itemType="track" />)
    expect(await screen.findByText("Couldn't load reactions")).toBeInTheDocument()
  })
})

describe('AlbumSocialSection / TrackReactionsButton', () => {
  it('hide themselves when the social server is not configured', async () => {
    vi.mocked(social.isConfigured).mockReturnValue(false)
    const { container } = render(<><AlbumSocialSection albumId="a1" /><TrackReactionsButton trackId="t1" /></>)
    await waitFor(() => expect(social.autoDetect).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('album section renders the panel with a heading', async () => {
    render(<AlbumSocialSection albumId="a1" />)
    expect(await screen.findByRole('heading', { name: 'Reactions & comments' })).toBeInTheDocument()
    await waitFor(() => expect(reactions.getSocial).toHaveBeenCalledWith('a1'))
  })

  it('track button opens and closes a popover for the track', async () => {
    const onSeek = vi.fn()
    render(<TrackReactionsButton trackId="t1" getPosition={() => 1} onSeek={onSeek} />)
    const btn = await screen.findByRole('button', { name: 'Reactions and comments' })
    fireEvent.click(btn)
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('great drop')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByText('1:05'))
    expect(onSeek).toHaveBeenCalledWith(65)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('summary badge', () => {
  function Probe({ ids }: { ids: string[] }) {
    const s = useReactionSummary(ids)
    return <>{ids.map(id => <ReactionBadge key={id} summary={s[id]} />)}</>
  }

  it('loads summaries and renders compact badges', async () => {
    vi.spyOn(reactions, 'getSummary').mockResolvedValue({ a: { reactions: 3, comments: 1, mine: [], top: ['🔥', '❤️'] } })
    render(<Probe ids={['a', 'b']} />)
    const badge = await screen.findByLabelText('3 reactions')
    expect(badge).toHaveTextContent('🔥❤️3')
    expect(screen.getAllByLabelText(/reaction/)).toHaveLength(1)
  })

  it('stays empty when unconfigured or failing', async () => {
    const spy = vi.spyOn(reactions, 'getSummary').mockRejectedValue(new Error('x'))
    const { container } = render(<Probe ids={['a']} />)
    await waitFor(() => expect(spy).toHaveBeenCalled())
    await act(async () => {})
    expect(container).toBeEmptyDOMElement()
    vi.mocked(social.isConfigured).mockReturnValue(false)
    spy.mockClear()
    render(<Probe ids={['z']} />)
    await waitFor(() => expect(social.autoDetect).toHaveBeenCalled())
    expect(spy).not.toHaveBeenCalled()
  })
})
