import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ToastContainer from './ToastContainer'
import { useToastStore } from '../../stores/toast'

beforeEach(() => {
  useToastStore.setState({ toasts: [] })
})

afterEach(() => {
  cleanup()
  useToastStore.setState({ toasts: [] })
})

describe('ToastContainer', () => {
  it('renders nothing when there are no toasts', () => {
    const { container } = render(<ToastContainer />)
    expect(container.firstChild).toBeNull()
  })

  it('renders one entry per toast with its message', () => {
    useToastStore.setState({
      toasts: [
        { id: '1', message: 'Saved!', type: 'success' },
        { id: '2', message: 'Oops', type: 'error' }
      ]
    })
    render(<ToastContainer />)
    expect(screen.getByText('Saved!')).toBeInTheDocument()
    expect(screen.getByText('Oops')).toBeInTheDocument()
  })

  it('dismisses a toast when its close button is clicked', () => {
    const dismiss = vi.spyOn(useToastStore.getState(), 'dismiss')
    useToastStore.setState({ toasts: [{ id: 'x', message: 'Bye', type: 'info' }] })
    render(<ToastContainer />)
    // Each toast has exactly one button (the close button).
    fireEvent.click(screen.getByRole('button'))
    expect(dismiss).toHaveBeenCalledWith('x')
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })
})
