import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useAuthStore } from '../../stores/auth'
import { useLibraryStore } from '../../stores/library'

const renderSidebar = () => render(<MemoryRouter><Sidebar /></MemoryRouter>)

describe('Sidebar admin-only links', () => {
  beforeEach(() => {
    useLibraryStore.setState({ fetchPlaylists: vi.fn(), playlists: [] })
  })

  it('hides Soulseek but keeps Requests for non-admins', () => {
    useAuthStore.setState({ isAdmin: false })
    renderSidebar()
    expect(screen.queryByRole('link', { name: 'Soulseek' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Requests' })).toBeInTheDocument()
  })

  it('shows Soulseek for admins', () => {
    useAuthStore.setState({ isAdmin: true })
    renderSidebar()
    expect(screen.getByRole('link', { name: 'Soulseek' })).toBeInTheDocument()
  })
})
