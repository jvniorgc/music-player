import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AdminRoute from './AdminRoute'
import { useAuthStore } from '../../stores/auth'

const renderAt = () => render(
  <MemoryRouter initialEntries={['/soulseek']}>
    <Routes>
      <Route path="/" element={<div>home</div>} />
      <Route path="/soulseek" element={<AdminRoute><div>secret</div></AdminRoute>} />
    </Routes>
  </MemoryRouter>
)

describe('AdminRoute', () => {
  beforeEach(() => useAuthStore.setState({ isAdmin: false }))

  it('redirects non-admins home', () => {
    renderAt()
    expect(screen.getByText('home')).toBeInTheDocument()
    expect(screen.queryByText('secret')).not.toBeInTheDocument()
  })

  it('renders the page for admins', () => {
    useAuthStore.setState({ isAdmin: true })
    renderAt()
    expect(screen.getByText('secret')).toBeInTheDocument()
  })
})
