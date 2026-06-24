import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal, InputModal, ConfirmModal, PlaylistPicker } from './Modal'

afterEach(() => cleanup())

describe('Modal', () => {
  it('renders nothing while closed', () => {
    render(<Modal open={false} title="Hi" onClose={() => {}}>body</Modal>)
    expect(screen.queryByText('Hi')).toBeNull()
    expect(screen.queryByText('body')).toBeNull()
  })

  it('renders title and children in a portal when open', () => {
    render(<Modal open title="My Title" onClose={() => {}}><p>child content</p></Modal>)
    expect(screen.getByRole('heading', { name: 'My Title' })).toBeInTheDocument()
    expect(screen.getByText('child content')).toBeInTheDocument()
  })

  it('closes on Escape key', () => {
    const onClose = vi.fn()
    render(<Modal open title="T" onClose={onClose}>x</Modal>)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores non-Escape keys', () => {
    const onClose = vi.fn()
    render(<Modal open title="T" onClose={onClose}>x</Modal>)
    fireEvent.keyDown(document.body, { key: 'Enter' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes when the backdrop is clicked but not when the panel is clicked', () => {
    const onClose = vi.fn()
    render(<Modal open title="Panel" onClose={onClose}><span>inside</span></Modal>)
    // Clicking inner content must not bubble to the backdrop handler.
    fireEvent.click(screen.getByText('inside'))
    expect(onClose).not.toHaveBeenCalled()
    // The outermost overlay carries the onClose handler.
    fireEvent.click(screen.getByText('Panel').closest('[class*="fixed inset-0"]')!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('InputModal', () => {
  it('disables confirm until a non-blank value is present', async () => {
    const onConfirm = vi.fn()
    render(<InputModal open title="Name" confirmLabel="Save" onClose={() => {}} onConfirm={onConfirm} />)
    const confirm = screen.getByRole('button', { name: 'Save' })
    expect(confirm).toBeDisabled()
    await userEvent.type(screen.getByRole('textbox'), '  hi  ')
    expect(confirm).toBeEnabled()
  })

  it('confirms with a trimmed value and closes', async () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    render(<InputModal open title="Name" onClose={onClose} onConfirm={onConfirm} />)
    await userEvent.type(screen.getByRole('textbox'), '  Playlist  ')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onConfirm).toHaveBeenCalledWith('Playlist')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('submits on Enter', async () => {
    const onConfirm = vi.fn()
    render(<InputModal open title="Name" onClose={() => {}} onConfirm={onConfirm} />)
    const input = screen.getByRole('textbox')
    await userEvent.type(input, 'Songs')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onConfirm).toHaveBeenCalledWith('Songs')
  })

  it('does not submit a whitespace-only value', () => {
    const onConfirm = vi.fn()
    render(<InputModal open title="Name" initialValue="   " onClose={() => {}} onConfirm={onConfirm} />)
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    expect(onConfirm).not.toHaveBeenCalled()
  })
})

describe('ConfirmModal', () => {
  it('shows the message and runs confirm then close', () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    render(<ConfirmModal open title="Delete?" message="Are you sure?" confirmLabel="Delete" onClose={onClose} onConfirm={onConfirm} />)
    expect(screen.getByText('Are you sure?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('applies destructive styling when requested', () => {
    render(<ConfirmModal open title="T" message="m" destructive confirmLabel="Remove" onClose={() => {}} onConfirm={() => {}} />)
    expect(screen.getByRole('button', { name: 'Remove' }).className).toContain('bg-red-600')
  })
})

describe('PlaylistPicker', () => {
  const playlists = [{ Id: 'a', Name: 'Chill' }, { Id: 'b', Name: 'Workout' }]

  it('lists playlists and selects one', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<PlaylistPicker open playlists={playlists} onClose={onClose} onSelect={onSelect} onCreate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Workout' }))
    expect(onSelect).toHaveBeenCalledWith('b')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('triggers create and closes', () => {
    const onCreate = vi.fn()
    const onClose = vi.fn()
    render(<PlaylistPicker open playlists={playlists} onClose={onClose} onSelect={() => {}} onCreate={onCreate} />)
    fireEvent.click(screen.getByRole('button', { name: '+ New Playlist' }))
    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders an empty list without a create-implied selection', () => {
    render(<PlaylistPicker open playlists={[]} onClose={() => {}} onSelect={() => {}} onCreate={() => {}} />)
    const dialog = screen.getByText('Add to Playlist').closest('div')!
    expect(within(dialog.parentElement!).getByRole('button', { name: '+ New Playlist' })).toBeInTheDocument()
  })
})
