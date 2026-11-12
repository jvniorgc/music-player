import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TrackMenu from './TrackMenu'
import { useLikesStore } from '../../stores/likes'

const open = (fav: boolean) => {
  render(<MemoryRouter><TrackMenu track={{ Id: 't1', Name: 'T', Type: 'Audio', UserData: { IsFavorite: fav } } as never} /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'More options' }))
}

describe('TrackMenu like entry', () => {
  beforeEach(() => useLikesStore.setState({ liked: {} }))

  it('likes a track that is not liked', () => {
    const toggle = vi.fn().mockResolvedValue(true)
    useLikesStore.setState({ toggle })
    open(false)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Like' }))
    expect(toggle).toHaveBeenCalledWith('t1')
  })

  it('offers removing a liked track, preferring the shared state', () => {
    open(true)
    expect(screen.getByRole('menuitem', { name: 'Remove from Liked songs' })).toBeInTheDocument()
  })
})
