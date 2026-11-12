import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import LikeButton from './LikeButton'
import { useLikesStore } from '../../stores/likes'
import { jellyfin } from '../../services/jellyfin'

const item = (Id: string, IsFavorite?: boolean) => ({ Id, UserData: IsFavorite === undefined ? undefined : { IsFavorite } }) as never

beforeEach(() => { vi.restoreAllMocks(); useLikesStore.setState({ liked: {} }) })

describe('LikeButton', () => {
  it('reflects UserData and toggles without bubbling to the row', async () => {
    const toggle = vi.spyOn(jellyfin, 'toggleFavorite').mockResolvedValue()
    const rowClick = vi.fn()
    render(<div onClick={rowClick}><LikeButton item={item('a', false)} /></div>)
    fireEvent.click(screen.getByRole('button', { name: 'Like' }))
    expect(rowClick).not.toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: 'Remove from Liked songs' })).toHaveAttribute('aria-pressed', 'true')
    expect(toggle).toHaveBeenCalledWith('a', false)
  })

  it('keeps every button for the same track in sync', () => {
    render(<><LikeButton item={item('a', true)} /><LikeButton item={item('a')} /></>)
    expect(screen.getAllByRole('button', { name: 'Remove from Liked songs' })).toHaveLength(2)
    act(() => useLikesStore.setState({ liked: { a: false } }))
    expect(screen.getAllByRole('button', { name: 'Like' })).toHaveLength(2)
  })

  it('treats missing UserData as not liked and fetches it when asked', async () => {
    vi.spyOn(jellyfin, 'getItem').mockResolvedValue(item('a', true))
    render(<LikeButton item={item('a')} fetchState />)
    expect(screen.getByRole('button', { name: 'Like' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove from Liked songs' })).toBeInTheDocument())
  })

  it('is hidden until row hover unless liked when revealOnHover is set', () => {
    const { rerender } = render(<LikeButton item={item('a', false)} revealOnHover />)
    expect(screen.getByRole('button')).toHaveClass('opacity-0')
    rerender(<LikeButton item={item('b', true)} revealOnHover />)
    expect(screen.getByRole('button')).not.toHaveClass('opacity-0')
  })
})
