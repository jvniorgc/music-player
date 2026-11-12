import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useState } from 'react'
import StarRating from './StarRating'
import AlbumReviews, { AlbumRatingSummary } from './AlbumReviews'
import ReviewsView from './ReviewsView'
import UserReviews from './UserReviews'
import * as social from '../../services/social'
import * as api from '../../services/reviews'
import { useReviewsStore } from '../../stores/reviews'
import { useToastStore } from '../../stores/toast'

const review = (over: Partial<api.Review> = {}): api.Review => ({
  albumId: 'a1', user: { id: 'u1', name: 'Ana' }, rating: 7, body: 'nice', albumName: 'OK Computer', albumArtist: 'Radiohead',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...over,
})
const album = { Id: 'a1', Name: 'OK Computer', AlbumArtist: 'Radiohead' } as never
const toastSpy = vi.fn()
vi.setConfig({ testTimeout: 20_000 })

beforeEach(() => {
  useReviewsStore.setState({ byAlbum: {} })
  useToastStore.setState({ show: toastSpy } as never)
  vi.spyOn(social, 'loadConfig').mockResolvedValue()
  vi.spyOn(social, 'autoDetect').mockResolvedValue(false)
  vi.spyOn(social, 'isConfigured').mockReturnValue(true)
  vi.spyOn(social, 'getMe').mockResolvedValue({ id: 'u1', name: 'Ana', isAdmin: true })
})

describe('StarRating', () => {
  function Harness() { const [v, setV] = useState(0); return <StarRating value={v} onChange={setV} /> }

  it('supports half-star clicks and keyboard', () => {
    render(<Harness />)
    const slider = screen.getByRole('slider', { name: 'Rating' })
    fireEvent.click(screen.getByTestId('star-7'))
    expect(slider).toHaveAttribute('aria-valuetext', 'Rated 3.5 out of 5')
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(slider).toHaveAttribute('aria-valuenow', '8')
    fireEvent.keyDown(slider, { key: 'End' }); fireEvent.keyDown(slider, { key: 'ArrowUp' })
    expect(slider).toHaveAttribute('aria-valuenow', '10')
    fireEvent.keyDown(slider, { key: 'Home' }); fireEvent.keyDown(slider, { key: 'ArrowLeft' })
    expect(slider).toHaveAttribute('aria-valuenow', '1')
    fireEvent.keyDown(slider, { key: 'x' })
    expect(slider).toHaveAttribute('aria-valuenow', '1')
  })

  it('renders read-only', () => {
    render(<StarRating value={4} />)
    expect(screen.getByRole('img', { name: 'Rated 2 out of 5' })).toBeInTheDocument()
  })
})

describe('AlbumReviews', () => {
  const renderAlbum = () => render(<MemoryRouter><AlbumRatingSummary albumId="a1" /><AlbumReviews album={album} /></MemoryRouter>)

  it('shows average, lists reviews and saves own review with snapshot', async () => {
    vi.spyOn(api, 'getAlbumReviews').mockResolvedValue({ average: 7, count: 1, mine: null, items: [review({ user: { id: 'u2', name: 'Bia' } })] })
    const save = vi.spyOn(api, 'saveReview').mockResolvedValue(review())
    renderAlbum()
    expect(await screen.findByText('Bia')).toBeInTheDocument()
    expect(screen.getAllByText('3.5').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Write a review' }))
    fireEvent.click(screen.getByTestId('star-9'))
    fireEvent.change(screen.getByLabelText('What did you think? (optional)'), { target: { value: 'wow' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(save).toHaveBeenCalledWith('a1', { rating: 9, body: 'wow', albumName: 'OK Computer', albumArtist: 'Radiohead' }))
    expect(toastSpy).toHaveBeenCalledWith('Review saved', 'success')
  })

  it('edits/deletes own review and lets admins delete others', async () => {
    vi.spyOn(api, 'getAlbumReviews').mockResolvedValue({ average: 7, count: 2, mine: review(), items: [review(), review({ user: { id: 'u2', name: 'Bia' } })] })
    const del = vi.spyOn(api, 'deleteReview').mockResolvedValue()
    const adminDel = vi.spyOn(api, 'adminDeleteReview').mockRejectedValue(new Error('x'))
    renderAlbum()
    fireEvent.click(await screen.findByRole('button', { name: 'Delete review' }))
    await waitFor(() => expect(adminDel).toHaveBeenCalledWith('a1', 'u2'))
    expect(toastSpy).toHaveBeenCalledWith("Couldn't reach the social server", 'error')
    fireEvent.click(screen.getByRole('button', { name: 'Edit your review' }))
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '7')
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete review' }).at(-1)!)
    await waitFor(() => expect(del).toHaveBeenCalledWith('a1'))
  })

  it('hides when not configured', async () => {
    vi.mocked(social.isConfigured).mockReturnValue(false)
    const get = vi.spyOn(api, 'getAlbumReviews')
    const { container } = renderAlbum()
    await waitFor(() => expect(social.autoDetect).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
    expect(get).not.toHaveBeenCalled()
  })
})

describe('ReviewsView', () => {
  const renderView = () => render(<MemoryRouter><ReviewsView /></MemoryRouter>)

  it('shows recent and top tabs', async () => {
    vi.spyOn(api, 'recentReviews').mockResolvedValue([review()])
    vi.spyOn(api, 'topRated').mockResolvedValue([{ albumId: 'a1', albumName: 'OK Computer', albumArtist: 'Radiohead', average: 9, count: 2 }])
    renderView()
    expect(await screen.findByText('OK Computer · Radiohead')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Top rated' }))
    expect(await screen.findByText('4.5')).toBeInTheDocument()
    expect(screen.getByText('2 reviews')).toBeInTheDocument()
  })

  it('shows not configured hint and errors', async () => {
    vi.mocked(social.isConfigured).mockReturnValue(false)
    const { unmount } = renderView()
    expect(await screen.findByRole('link', { name: 'Open settings' })).toBeInTheDocument()
    unmount()
    vi.mocked(social.isConfigured).mockReturnValue(true)
    vi.spyOn(api, 'recentReviews').mockRejectedValue(new Error('x'))
    renderView()
    expect(await screen.findByText("Couldn't reach the social server")).toBeInTheDocument()
  })
})

describe('UserReviews', () => {
  it('lists a user reviews', async () => {
    vi.spyOn(api, 'userReviews').mockResolvedValue([review()])
    render(<MemoryRouter><UserReviews userId="u1" name="Ana" /></MemoryRouter>)
    expect(await screen.findByText('Reviews by Ana')).toBeInTheDocument()
  })
})
