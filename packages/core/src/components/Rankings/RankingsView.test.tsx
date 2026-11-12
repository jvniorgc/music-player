import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import RankingsView from './RankingsView'
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

describe('RankingsView', () => {
  beforeEach(() => {
    vi.spyOn(social, 'loadConfig').mockResolvedValue()
    vi.spyOn(social, 'autoDetect').mockResolvedValue(false)
    vi.spyOn(social, 'isConfigured').mockReturnValue(true)
    vi.spyOn(plays, 'getWeekRanking').mockResolvedValue(week())
  })

  it('links to settings when not configured', async () => {
    vi.mocked(social.isConfigured).mockReturnValue(false)
    renderView()
    fireEvent.click(await screen.findByRole('link', { name: 'Open settings' }))
    expect(screen.getByTestId('loc')).toHaveTextContent('/settings')
    expect(plays.getWeekRanking).not.toHaveBeenCalled()
  })

  it('shows top lists and listeners only', async () => {
    renderView()
    expect(await screen.findByRole('link', { name: 'Ana' })).toHaveAttribute('href', '/social/user/ana')
    expect(screen.getByText('9 min · 3 plays')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Song' })).toHaveAttribute('href', '/album/al1')
    expect(screen.getByText('NoAlbum').tagName).toBe('P')
    expect(screen.getByRole('link', { name: 'Album' })).toHaveAttribute('href', '/album/al1')
    expect(screen.getByRole('link', { name: 'Artist' })).toHaveAttribute('href', '/artist/ar1')
    expect(screen.getByText('Loose').tagName).toBe('P')
    expect(screen.queryByText('Achievements')).not.toBeInTheDocument()
    expect(screen.queryByText('Who discovered first')).not.toBeInTheDocument()
  })

  it('switches weeks and shows empty states', async () => {
    renderView()
    await screen.findByRole('link', { name: 'Ana' })
    vi.mocked(plays.getWeekRanking).mockResolvedValue(week({ tracks: [], albums: [], artists: [], listeners: [] }))
    fireEvent.click(screen.getByRole('tab', { name: 'Last week' }))
    await waitFor(() => expect(plays.getWeekRanking).toHaveBeenLastCalledWith(1))
    await waitFor(() => expect(screen.getAllByText('Nothing played yet')).toHaveLength(4))
    expect(screen.getByRole('tab', { name: 'Last week' })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows an error with retry', async () => {
    vi.mocked(plays.getWeekRanking).mockRejectedValueOnce(new Error('x'))
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('link', { name: 'Ana' })).toBeInTheDocument()
  })
})
