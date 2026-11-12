import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import FeedView, { HomeFeedSection } from './Feed'
import * as social from '../../services/social'
import * as feed from '../../services/feed'
import { jellyfin } from '../../services/jellyfin'

const recent = new Date(Date.now() - 5 * 60_000).toISOString()
const items: feed.FeedItem[] = [
  { type: 'soulseek_download', id: 'ev-1', time: recent, actor: { id: 'p', name: 'Pedro' }, count: 3, files: 30, albums: [{ folder: 'a', albumName: 'Kid A', artist: 'Radiohead' }, { folder: 'b' }, { folder: 'c' }] },
  { type: 'soulseek_download', id: 'ev-2', time: recent, actor: { id: 'p', name: 'Pedro' }, count: 1, files: 1, albums: [{ folder: 'loose' }] },
  { type: 'request_fulfilled', id: 'req-1', time: recent, actor: { id: 'a', name: 'Ana' }, title: 'OK Computer', artist: 'Radiohead', coverUrl: 'http://c/x.jpg' },
  { type: 'request_fulfilled', id: 'req-2', time: recent, actor: { id: 'a', name: 'Ana' }, title: 'Nocover', artist: 'X', coverUrl: null },
  { type: 'library_added', id: 'lib-1', time: recent, albums: [{ id: 'al1', name: 'Amnesiac', artist: 'Radiohead' }] },
  { type: 'library_added', id: 'lib-2', time: recent, albums: [{ id: 'al2', name: 'One', artist: null }, { id: 'al3', name: 'Two', artist: 'Y' }] },
]

function Loc() { const l = useLocation(); return <div data-testid="loc">{l.pathname + l.search}</div> }

const renderAt = (el: React.ReactNode) => render(
  <MemoryRouter><Routes><Route path="*" element={<>{el}<Loc /></>} /></Routes></MemoryRouter>
)

beforeEach(() => {
  jellyfin.setAuth({ serverUrl: 'http://jf', token: 't', userId: 'u', username: 'u', serverId: 's' } as never)
  vi.spyOn(social, 'loadConfig').mockResolvedValue()
  vi.spyOn(social, 'autoDetect').mockResolvedValue(false)
  vi.spyOn(social, 'isConfigured').mockReturnValue(true)
  vi.spyOn(feed, 'getFeed').mockResolvedValue({ items, nextBefore: null })
})

describe('HomeFeedSection', () => {
  it('renders nothing when not configured', async () => {
    vi.mocked(social.isConfigured).mockReturnValue(false)
    const { container } = renderAt(<HomeFeedSection />)
    await waitFor(() => expect(social.autoDetect).toHaveBeenCalled())
    expect(container.querySelector('section')).toBeNull()
    expect(feed.getFeed).not.toHaveBeenCalled()
  })

  it('renders nothing when the feed is empty or fails', async () => {
    vi.mocked(feed.getFeed).mockRejectedValueOnce(new Error('x'))
    const { container } = renderAt(<HomeFeedSection />)
    await waitFor(() => expect(feed.getFeed).toHaveBeenCalledWith({ limit: 5 }))
    expect(container.querySelector('section')).toBeNull()
  })

  it('shows entries with links and navigates to the full feed', async () => {
    renderAt(<HomeFeedSection />)
    expect(await screen.findByText("What's new")).toBeInTheDocument()
    expect(screen.getByText('Pedro added 3 albums via Soulseek')).toBeInTheDocument()
    expect(screen.getByText('Kid A — Radiohead, b, c')).toBeInTheDocument()
    expect(screen.getByText('Pedro downloaded loose via Soulseek')).toBeInTheDocument()
    expect(screen.getByText("Ana's request “OK Computer” was fulfilled")).toBeInTheDocument()
    expect(screen.getByText('New in the library: Amnesiac')).toBeInTheDocument()
    expect(screen.getByText('2 new albums in the library')).toBeInTheDocument()
    expect(screen.getAllByText('5 minutes ago').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByText('Amnesiac'))
    expect(screen.getByTestId('loc')).toHaveTextContent('/album/al1')
    fireEvent.click(screen.getByText('One'))
    expect(screen.getByTestId('loc')).toHaveTextContent('/album/al2')
    fireEvent.click(screen.getByText('OK Computer'))
    expect(screen.getByTestId('loc')).toHaveTextContent('/search?q=OK%20Computer')
    fireEvent.click(screen.getByText('See all'))
    expect(screen.getByTestId('loc')).toHaveTextContent('/feed')
  })
})

describe('FeedView', () => {
  it('shows a settings hint when not configured', async () => {
    vi.mocked(social.isConfigured).mockReturnValue(false)
    renderAt(<FeedView />)
    fireEvent.click(await screen.findByRole('link', { name: 'Open settings' }))
    expect(screen.getByTestId('loc')).toHaveTextContent('/settings')
  })

  it('loads more pages and shows errors and empty states', async () => {
    vi.mocked(feed.getFeed)
      .mockResolvedValueOnce({ items: items.slice(0, 1), nextBefore: 'cur' })
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValueOnce({ items: items.slice(4, 5), nextBefore: null })
    renderAt(<FeedView />)
    expect(await screen.findByText('Pedro added 3 albums via Soulseek')).toBeInTheDocument()
    expect(feed.getFeed).toHaveBeenCalledWith({})
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByText('Could not load the feed')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByText('New in the library: Amnesiac')).toBeInTheDocument()
    expect(feed.getFeed).toHaveBeenLastCalledWith({ before: 'cur' })
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })

  it('shows an empty state', async () => {
    vi.mocked(feed.getFeed).mockResolvedValueOnce({ items: [], nextBefore: null })
    renderAt(<FeedView />)
    expect(await screen.findByText('Nothing new yet')).toBeInTheDocument()
  })
})
