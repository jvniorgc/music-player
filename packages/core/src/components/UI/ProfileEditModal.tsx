import { useRef, useState } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import { Modal } from './Modal'
import { ImageCropper } from './ImageCropper'
import { useAuthStore } from '../../stores/auth'
import { jellyfin } from '../../services/jellyfin'
import { useToastStore } from '../../stores/toast'

interface ProfileEditModalProps {
  open: boolean
  onClose: () => void
}

export function ProfileEditModal({ open, onClose }: ProfileEditModalProps) {
  const { auth, primaryImageTag, updateProfile } = useAuthStore()
  const toast = useToastStore(s => s.show)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState(auth?.username || '')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null)
  const [saving, setSaving] = useState(false)
  const [cropping, setCropping] = useState(false)
  const [rawImageUrl, setRawImageUrl] = useState<string | null>(null)

  const currentImageUrl = auth?.userId && primaryImageTag
    ? jellyfin.getUserImageUrl(auth.userId, primaryImageTag, 200)
    : null

  const displayImage = previewUrl ?? currentImageUrl

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setRawImageUrl(url)
    setCropping(true)
    e.target.value = ''
  }

  const handleCropDone = (blob: Blob) => {
    setPendingBlob(blob)
    const url = URL.createObjectURL(blob)
    setPreviewUrl(url)
    setCropping(false)
    if (rawImageUrl) URL.revokeObjectURL(rawImageUrl)
    setRawImageUrl(null)
  }

  const handleCropCancel = () => {
    setCropping(false)
    if (rawImageUrl) URL.revokeObjectURL(rawImageUrl)
    setRawImageUrl(null)
  }

  const handleSave = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) return
    setSaving(true)
    try {
      await updateProfile(
        trimmedName !== auth?.username ? trimmedName : undefined,
        pendingBlob ?? undefined
      )
      toast('Profile updated', 'success')
      setPendingBlob(null)
      setPreviewUrl(null)
      onClose()
    } catch (err: any) {
      toast(err.message || 'Failed to update profile', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    setPendingBlob(null)
    setPreviewUrl(null)
    setCropping(false)
    if (rawImageUrl) URL.revokeObjectURL(rawImageUrl)
    setRawImageUrl(null)
    setName(auth?.username || '')
    onClose()
  }

  return (
    <Modal open={open} title="Edit Profile" onClose={handleClose}>
      {cropping && rawImageUrl ? (
        <ImageCropper
          imageUrl={rawImageUrl}
          onCrop={handleCropDone}
          onCancel={handleCropCancel}
        />
      ) : (
        <div className="flex flex-col items-center gap-6">
          {/* Avatar picker */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="relative w-24 h-24 rounded-full overflow-hidden group shrink-0 focus:outline-none focus:ring-2 focus:ring-accent"
            title="Change profile photo"
          >
            {displayImage ? (
              <img src={displayImage} className="w-full h-full object-cover" alt="Avatar" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-bg-elevated to-bg-tertiary">
                <span className="text-4xl">👤</span>
              </div>
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera size={20} className="text-white" />
              <span className="text-[10px] text-white mt-1">Change</span>
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Name input */}
          <div className="w-full">
            <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
              Display Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              className="w-full bg-bg-elevated border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition"
              placeholder="Your name"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 w-full">
            <button
              onClick={handleClose}
              disabled={saving}
              className="px-5 py-2 rounded-full text-sm text-text-secondary hover:text-text-primary hover:bg-white/10 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="px-5 py-2 rounded-full text-sm font-semibold bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Save
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
