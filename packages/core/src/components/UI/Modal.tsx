import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button, Input } from './Button'
import { useT } from '../../i18n'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
}

export function Modal({ open, title, onClose, children }: ModalProps) {
  const { t } = useT()
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
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-surface-1 border border-border rounded-lg shadow-lg w-full max-w-md mx-4 fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button variant="icon" onClick={onClose} aria-label={t('common.close')} title={t('common.close')}>
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

export function InputModal({ open, title, placeholder, initialValue = '', confirmLabel, onClose, onConfirm }: InputModalProps) {
  const { t } = useT()
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
          {t('common.cancel')}
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!value.trim()}
        >
          {confirmLabel ?? t('common.confirm')}
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

export function ConfirmModal({ open, title, message, confirmLabel, destructive, onClose, onConfirm }: ConfirmModalProps) {
  const { t } = useT()
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <p className="text-sm text-text-secondary">{message}</p>
      <div className="flex justify-end gap-3 mt-5">
        <Button
          variant="secondary"
          onClick={onClose}
        >
          {t('common.cancel')}
        </Button>
        <Button
          variant={destructive ? 'danger' : 'primary'}
          onClick={() => { onConfirm(); onClose() }}
        >
          {confirmLabel ?? t('common.confirm')}
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
  const { t } = useT()
  return (
    <Modal open={open} title={t('menu.addToPlaylist')} onClose={onClose}>
      <div className="space-y-1 max-h-64 overflow-y-auto -mx-1">
        {playlists.map(pl => (
          <button
            key={pl.Id}
            onClick={() => { onSelect(pl.Id); onClose() }}
            className="w-full text-left px-4 py-2.5 rounded-sm text-sm hover:bg-white/10 transition-colors truncate"
          >
            {pl.Name}
          </button>
        ))}
      </div>
      <button
        onClick={() => { onCreate(); onClose() }}
        className="w-full mt-3 px-4 h-8 rounded-sm text-sm font-medium text-accent border border-border hover:bg-white/5 transition-colors"
      >
        {t('playlist.new')}
      </button>
    </Modal>
  )
}
