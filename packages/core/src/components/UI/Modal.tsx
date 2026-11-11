import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button, Input } from './Button'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
}

export function Modal({ open, title, onClose, children }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-bg-secondary rounded-2xl shadow-2xl w-full max-w-md mx-4 fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <h2 className="text-lg font-bold">{title}</h2>
          <Button variant="icon" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body
  )
}

interface InputModalProps {
  open: boolean
  title: string
  placeholder?: string
  initialValue?: string
  confirmLabel?: string
  onClose: () => void
  onConfirm: (value: string) => void
}

export function InputModal({ open, title, placeholder, initialValue = '', confirmLabel = 'Confirm', onClose, onConfirm }: InputModalProps) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setValue(initialValue)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open, initialValue])

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (trimmed) {
      onConfirm(trimmed)
      onClose()
    }
  }

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <Input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        placeholder={placeholder}
      />
      <div className="flex justify-end gap-3 mt-5">
        <Button
          variant="secondary"
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!value.trim()}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}

interface ConfirmModalProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  destructive?: boolean
  onClose: () => void
  onConfirm: () => void
}

export function ConfirmModal({ open, title, message, confirmLabel = 'Confirm', destructive, onClose, onConfirm }: ConfirmModalProps) {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <p className="text-sm text-text-secondary">{message}</p>
      <div className="flex justify-end gap-3 mt-5">
        <Button
          variant="secondary"
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          variant={destructive ? 'danger' : 'primary'}
          onClick={() => { onConfirm(); onClose() }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}

interface PlaylistPickerProps {
  open: boolean
  playlists: { Id: string; Name: string }[]
  onClose: () => void
  onSelect: (playlistId: string) => void
  onCreate: () => void
}

export function PlaylistPicker({ open, playlists, onClose, onSelect, onCreate }: PlaylistPickerProps) {
  return (
    <Modal open={open} title="Add to Playlist" onClose={onClose}>
      <div className="space-y-1 max-h-64 overflow-y-auto -mx-1">
        {playlists.map(pl => (
          <button
            key={pl.Id}
            onClick={() => { onSelect(pl.Id); onClose() }}
            className="w-full text-left px-4 py-2.5 rounded-lg text-sm hover:bg-white/10 transition-colors truncate"
          >
            {pl.Name}
          </button>
        ))}
      </div>
      <button
        onClick={() => { onCreate(); onClose() }}
        className="w-full mt-3 px-4 py-2.5 rounded-xl text-sm font-medium text-accent border border-accent/30 hover:bg-accent/10 transition-colors"
      >
        + New Playlist
      </button>
    </Modal>
  )
}
