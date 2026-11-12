import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import RankingsView from './RankingsView'
import { DiscoveredBadge } from './DiscoveredBadge'
import * as social from '../../services/social'
import * as plays from '../../services/plays'

function Loc() { const l = useLocation(); return <div data-testid="loc">{l.pathname}</div> }
const renderView = () => render(
  <MemoryRouter initialEntries={['/rankings']}>
    <Routes><Route path="*" element={<><RankingsView /><Loc /></>} /></Routes>
  </MemoryRouter>
)

const week = (over: Partial<plays.WeekRanking> = {}): plays.WeekRanking => ({
  start: 's', end: 'e',
  tracks: [{ id: 't1', name: 'Song', artists: 'Artist', albumId: 'al1', plays: 3, minutes: 9 }, { id: 't2', name: 'NoAlbum', plays: 1, minutes: 2 }],
  albums: [{ id: 'al1', name: 'Album', artists: 'Artist', plays: 3, minutes: 9 }],
  artists: [{ id: 'ar1', name: 'Artist', plays: 3, minutes: 9 }, { id: null, name: 'Loose', plays: 1, minutes: 1 }],
  listeners: [{ user: { id: 'ana', name: 'Ana' }, plays: 3, minutes: 9 }],
  ...over,
})
const discovery: plays.Discovery = { albumId: 'al1', albumName: 'Album', artists: 'Artist', user: { id: 'bia', name: 'Bia' }, playedAt: '2026-01-01T00:00:00Z' }

describe('RankingsView', () => {
  beforeEach(() => {
    vi.spyOn(social, 'loadConfig').mockResolvedValue()
    vi.spyOn(social, 'autoDetect').mockResolvedValue(false)
    vi.spyOn(social, 'isConfigured').mockReturnValue(true)
    vi.spyOn(plays, 'getWeekRanking').mockResolvedValue(week())
    vi.spyOn(plays, 'getAchievements').mockResolvedValue([
      { id: 'night_owl', threshold: 50, unlocked: [{ user: { id: 'ana', name: 'Ana' }, value: 60 }] },
      { id: 'streak', threshold: 7, unlocked: [] },
    ])
    vi.spyOn(plays, 'getRecentDiscoveries').mockResolvedValue([discovery])
  })

  it('links to settings when not configured', async () => {
    vi.mocked(social.isConfigured).mockReturnValue(false)
    renderView()
    fireEvent.click(await screen.findByRole('link', { name: 'Open settings' }))
    expect(screen.getByTestId('loc')).toHaveTextContent('/settings')
    expect(plays.getWeekRanking).not.toHaveBeenCalled()
  })

  it('shows top lists, listeners, achievements and discoveries', async () => {
    renderView()
    expect(await screen.findByRole('link', { name: 'Ana' })).toHaveAttribute('href', '/social/user/ana')
    expect(screen.getByText('9 min · 3 plays')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Song' })).toHaveAttribute('href', '/album/al1')
    expect(screen.getByText('NoAlbum').tagName).toBe('P')
    expect(screen.getByRole('link', { name: 'Album' })).toHaveAttribute('href', '/album/al1')
    expect(screen.getByRole('link', { name: 'Artist' })).toHaveAttribute('href', '/artist/ar1')
    expect(screen.getByText('Loose').tagName).toBe('P')
    expect(within(screen.getByTestId('achievement-night_owl')).getByText('Night owl')).toBeInTheDocument()
    expect(within(screen.getByTestId('achievement-night_owl')).getByText('Ana')).toBeInTheDocument()
    expect(within(screen.getByTestId('achievement-streak')).getByText('Nobody yet')).toBeInTheDocument()
    expect(screen.getByText(/Discovered by Bia/)).toBeInTheDocument()
  })

  it('switches weeks and shows empty states', async () => {
    renderView()
    await screen.findByRole('link', { name: 'Ana' })
    vi.mocked(plays.getWeekRanking).mockResolvedValue(week({ tracks: [], albums: [], artists: [], listeners: [] }))
    vi.mocked(plays.getRecentDiscoveries).mockResolvedValue([])
    fireEvent.click(screen.getByRole('tab', { name: 'Last week' }))
    await waitFor(() => expect(plays.getWeekRanking).toHaveBeenLastCalledWith(1))
    await waitFor(() => expect(screen.getAllByText('Nothing played yet')).toHaveLength(5))
    expect(screen.getByRole('tab', { name: 'Last week' })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows an error with retry', async () => {
    vi.mocked(plays.getAchievements).mockRejectedValueOnce(new Error('x'))
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('link', { name: 'Ana' })).toBeInTheDocument()
  })
})

describe('DiscoveredBadge', () => {
  beforeEach(() => {
    vi.spyOn(social, 'isConfigured').mockReturnValue(true)
    vi.spyOn(plays, 'getDiscoveries').mockResolvedValue([discovery])
  })

  it('shows who discovered the album', async () => {
    render(<DiscoveredBadge albumId="al1" />)
    expect(await screen.findByText('Discovered by Bia')).toBeInTheDocument()
    expect(plays.getDiscoveries).toHaveBeenCalledWith(['al1'])
  })

  it('renders nothing when unknown, failing or unconfigured', async () => {
    const { container, rerender, unmount } = render(<DiscoveredBadge albumId="other" />)
    await waitFor(() => expect(plays.getDiscoveries).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
    vi.mocked(plays.getDiscoveries).mockRejectedValueOnce(new Error('x'))
    rerender(<DiscoveredBadge albumId="x" />)
    vi.mocked(social.isConfigured).mockReturnValue(false)
    rerender(<DiscoveredBadge albumId="y" />)
    unmount()
    expect(plays.getDiscoveries).toHaveBeenCalledTimes(2)
  })
})
