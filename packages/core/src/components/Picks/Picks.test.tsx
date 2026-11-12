import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import * as social from '../../services/social'
import * as picks from '../../services/picks'
import { useToastStore } from '../../stores/toast'
import PicksRow from './PicksRow'
import PicksHistoryView from './PicksHistoryView'
import { usePickAlbum, PICKS_CHANGED } from './usePickAlbum'
import type { JellyfinItem } from '../../services/jellyfin'

const pick = (over: Partial<picks.AlbumPick> = {}): picks.AlbumPick => ({
  weekStart: '2026-11-08', user: { id: 'u2', name: 'Bia' }, albumId: 'a1', albumName: 'Abbey Road', artist: 'The Beatles',
  year: '1969', note: 'so good', createdAt: '2026-11-12T00:00:00Z', updatedAt: '2026-11-12T00:00:00Z', ...over,
})
const week = (over: Partial<picks.PicksWeek> = {}): picks.PicksWeek => ({
  weekStart: '2026-11-08', expiresAt: new Date(Date.now() + 2.5 * 86_400_000).toISOString(), items: [pick()], mine: null, ...over,
})

function Loc() { const l = useLocation(); return <div data-testid="loc">{l.pathname}</div> }
const wrap = (ui: React.ReactNode) => render(
  <MemoryRouter><Routes><Route path="*" element={<>{ui}<Loc /></>} /></Routes></MemoryRouter>
)
const toastSpy = vi.fn()

beforeEach(() => {
  useToastStore.setState({ show: toastSpy } as never)
  vi.spyOn(social, 'loadConfig').mockResolvedValue()
  vi.spyOn(social, 'autoDetect').mockResolvedValue(false)
  vi.spyOn(social, 'isConfigured').mockReturnValue(true)
  vi.spyOn(picks, 'getCurrentPicks').mockResolvedValue(week())
})

describe('PicksRow', () => {
  it('renders friends picks with expiry, CTA and navigates to the album', async () => {
    wrap(<PicksRow />)
    expect(await screen.findByText('Abbey Road')).toBeInTheDocument()
    expect(screen.getByText("Friends' picks this week")).toBeInTheDocument()
    expect(screen.getByText('Expires in 3 days')).toBeInTheDocument()
    expect(screen.getByText('Bia')).toBeInTheDocument()
    expect(screen.getByText('so good')).toBeInTheDocument()
    expect(screen.getByText(/Pick an album of the week/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Abbey Road/ }))
    expect(screen.getByTestId('loc')).toHaveTextContent('/album/a1')
  })

  it('hides when not configured or on error', async () => {
    vi.mocked(social.isConfigured).mockReturnValue(false)
    const { container, unmount } = wrap(<PicksRow />)
    await waitFor(() => expect(social.autoDetect).toHaveBeenCalled())
    expect(container.querySelector('section')).toBeNull()
    unmount()
    vi.mocked(social.isConfigured).mockReturnValue(true)
    vi.mocked(picks.getCurrentPicks).mockRejectedValue(new Error('x'))
    const r = wrap(<PicksRow />)
    await waitFor(() => expect(picks.getCurrentPicks).toHaveBeenCalled())
    expect(r.container.querySelector('section')).toBeNull()
  })

  it('marks and removes my pick, and refreshes on change', async () => {
    const mine = pick({ user: { id: 'me', name: 'Me' }, albumId: 'a2', albumName: 'Kind of Blue', note: null })
    vi.mocked(picks.getCurrentPicks).mockResolvedValue(week({ items: [mine], mine }))
    const del = vi.spyOn(picks, 'deleteMyPick').mockResolvedValue()
    wrap(<PicksRow />)
    expect(await screen.findByText('Your pick')).toBeInTheDocument()
    expect(screen.queryByText(/Pick an album of the week/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Remove my pick' }))
    await waitFor(() => expect(del).toHaveBeenCalled())
    expect(toastSpy).toHaveBeenCalledWith('Pick removed', 'success')
    await waitFor(() => expect(picks.getCurrentPicks).toHaveBeenCalledTimes(2))
    del.mockRejectedValueOnce(new Error('x'))
    fireEvent.click(screen.getByRole('button', { name: 'Remove my pick' }))
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith("Couldn't save your pick", 'error'))
  })
})

describe('PicksHistoryView', () => {
  it('lists past weeks', async () => {
    vi.spyOn(picks, 'getPicksHistory').mockResolvedValue([{ weekStart: '2026-11-01', items: [pick()] }])
    wrap(<PicksHistoryView />)
    expect(await screen.findByText('Abbey Road')).toBeInTheDocument()
    expect(screen.getByText(/Week of/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Abbey Road/ }))
    expect(screen.getByTestId('loc')).toHaveTextContent('/album/a1')
  })

  it('shows empty, error and not-configured states', async () => {
    const hist = vi.spyOn(picks, 'getPicksHistory').mockResolvedValue([])
    const a = wrap(<PicksHistoryView />)
    expect(await screen.findByText('No picks from previous weeks yet.')).toBeInTheDocument()
    a.unmount()
    hist.mockRejectedValue(new Error('x'))
    const b = wrap(<PicksHistoryView />)
    expect(await screen.findByText("Couldn't load picks")).toBeInTheDocument()
    b.unmount()
    vi.mocked(social.isConfigured).mockReturnValue(false)
    wrap(<PicksHistoryView />)
    fireEvent.click(await screen.findByRole('link', { name: 'Open settings' }))
    expect(screen.getByTestId('loc')).toHaveTextContent('/settings')
  })
})

describe('usePickAlbum', () => {
  const album = { Id: 'a1', Name: 'Abbey Road', AlbumArtist: 'The Beatles', ProductionYear: 1969 } as JellyfinItem
  function Harness({ item = album }: { item?: JellyfinItem }) {
    const { entry, modals } = usePickAlbum(item)
    return <>{entry && <button onClick={entry.onSelect}>{entry.label}</button>}{modals}</>
  }

  it('is hidden when not configured', () => {
    vi.mocked(social.isConfigured).mockReturnValue(false)
    render(<Harness />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('picks with an optional note and notifies listeners', async () => {
    const set = vi.spyOn(picks, 'setMyPick').mockResolvedValue(pick())
    const listener = vi.fn()
    window.addEventListener(PICKS_CHANGED, listener)
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Pick as my album of the week' }))
    const input = await screen.findByPlaceholderText('Why should your friends listen?')
    fireEvent.change(input, { target: { value: ' great ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Pick' }))
    await waitFor(() => expect(set).toHaveBeenCalledWith({ albumId: 'a1', albumName: 'Abbey Road', artist: 'The Beatles', year: '1969', note: 'great' }))
    expect(toastSpy).toHaveBeenCalledWith('Album of the week picked', 'success')
    expect(listener).toHaveBeenCalled()
    window.removeEventListener(PICKS_CHANGED, listener)
  })

  it('confirms before replacing a different pick and handles failures', async () => {
    vi.mocked(picks.getCurrentPicks).mockResolvedValue(week({ mine: pick({ albumId: 'zz', albumName: 'Other' }) }))
    const set = vi.spyOn(picks, 'setMyPick').mockRejectedValue(new Error('x'))
    render(<Harness item={{ Id: 'a1', Name: 'Abbey Road', Artists: ['Beatles'] } as JellyfinItem} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pick as my album of the week' }))
    expect(await screen.findByText('Your current pick for this week is "Other". Replace it?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }))
    await screen.findByPlaceholderText('Why should your friends listen?')
    fireEvent.click(screen.getByRole('button', { name: 'Pick' }))
    await waitFor(() => expect(set).toHaveBeenCalledWith({ albumId: 'a1', albumName: 'Abbey Road', artist: 'Beatles', year: undefined, note: undefined }))
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith("Couldn't save your pick", 'error'))
  })

  it('prefills the note when re-picking the same album and tolerates load errors', async () => {
    vi.mocked(picks.getCurrentPicks).mockResolvedValueOnce(week({ mine: pick({ note: 'old' }) }))
    render(<Harness item={{ Id: 'a1', Name: 'X' } as JellyfinItem} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pick as my album of the week' }))
    expect(await screen.findByDisplayValue('old')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    vi.mocked(picks.getCurrentPicks).mockRejectedValueOnce(new Error('x'))
    fireEvent.click(screen.getByRole('button', { name: 'Pick as my album of the week' }))
    expect(await screen.findByPlaceholderText('Why should your friends listen?')).toBeInTheDocument()
  })
})
