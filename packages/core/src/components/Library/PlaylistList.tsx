import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibraryStore } from '../../stores/library'
import { jellyfin, JellyfinItem } from '../../services/jellyfin'
import { ListMusic, Plus, MoreHorizontal, Pencil, Trash2, Lock } from 'lucide-react'
import { InputModal, ConfirmModal } from '../UI/Modal'
import { useToastStore } from '../../stores/toast'

export default function PlaylistList() {
  const { playlists, fetchPlaylists } = useLibraryStore()
  const navigate = useNavigate()
  const toast = useToastStore(s => s.show)

  const [showCreate, setShowCreate] = useState(false)
  const [renameTarget, setRenameTarget] = useState<JellyfinItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<JellyfinItem | null>(null)
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null)

  useEffect(() => {
    fetchPlaylists()
  }, [])

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [contextMenu])

  const handleCreate = async (name: string) => {
    try {
      const res = await jellyfin.createPlaylist(name)
      await fetchPlaylists()
      toast('Playlist created', 'success')
      navigate(`/playlist/${res.Id}`)
    } catch (err) {
      console.error('Failed to create playlist:', err)
      toast('Error creating playlist', 'error')
    }
  }

  const handleRename = async (name: string) => {
    if (!renameTarget) return
    try {
      await jellyfin.renameItem(renameTarget.Id, name)
      await fetchPlaylists()
      toast('Playlist renamed', 'success')
    } catch (err) {
      console.error('Failed to rename playlist:', err)
      toast('Could not rename. The playlist may be read-only.', 'error')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await jellyfin.deleteItem(deleteTarget.Id)
      await fetchPlaylists()
      toast('Playlist deleted', 'success')
    } catch (err) {
      console.error('Failed to delete playlist:', err)
      toast('Could not delete. File-based playlists (.m3u) cannot be deleted by the app.', 'error')
    }
  }

  return (
    <div className="fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Playlists</h1>
          {playlists.length > 0 && (
            <p className="text-sm text-text-secondary mt-1">{playlists.length} playlists</p>
          )}
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-full text-sm font-semibold transition-colors"
        >
          <Plus size={16} />
          New Playlist
        </button>
      </div>

      {playlists.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
          {playlists.map(pl => {
            const imageUrl = pl.ImageTags?.Primary
              ? jellyfin.getImageUrl(pl.Id, pl.ImageTags.Primary)
              : null

            return (
              <div
                key={pl.Id}
                className="group cursor-pointer relative"
                onClick={() => navigate(`/playlist/${pl.Id}`)}
                onContextMenu={e => {
                  e.preventDefault()
                  setContextMenu({ id: pl.Id, x: e.clientX, y: e.clientY })
                }}
              >
                <div className="relative aspect-square rounded-xl overflow-hidden bg-bg-elevated mb-3 shadow-lg shadow-black/20">
                  {imageUrl ? (
                    <img src={imageUrl} className="w-full h-full object-cover" alt="" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-accent/20 to-pink-600/20">
                      <ListMusic size={48} className="text-accent/60" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{pl.Name}</p>
                    <p className="text-xs text-text-secondary">
                      {pl.ChildCount ? `${pl.ChildCount} songs` : 'Playlist'}
                    </p>
                  </div>
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      setContextMenu({ id: pl.Id, x: e.clientX, y: e.clientY })
                    }}
                    className="p-1.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-white/10 text-text-tertiary transition-all shrink-0"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                </div>

                {/* Context menu */}
                {contextMenu?.id === pl.Id && (
                  <div
                    className="fixed z-50 bg-bg-elevated border border-border rounded-xl shadow-2xl py-1.5 min-w-[160px]"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      onClick={() => { setContextMenu(null); setRenameTarget(pl) }}
                      className="flex items-center gap-3 w-full px-4 py-2 text-sm hover:bg-white/10 transition-colors"
                    >
                      <Pencil size={14} />
                      Rename
                    </button>
                    <button
                      onClick={() => { setContextMenu(null); setDeleteTarget(pl) }}
                      className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-400 hover:bg-white/10 transition-colors"
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-text-tertiary">
          <ListMusic size={48} className="mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-text-secondary mb-1">No playlists</h3>
          <p className="text-sm mb-4">Create your first playlist</p>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-5 py-2.5 rounded-full text-sm font-semibold transition-colors"
          >
            <Plus size={16} />
            Create Playlist
          </button>
        </div>
      )}

      <InputModal
        open={showCreate}
        title="New Playlist"
        placeholder="Playlist name"
        confirmLabel="Create"
        onClose={() => setShowCreate(false)}
        onConfirm={handleCreate}
      />

      <InputModal
        open={!!renameTarget}
        title="Rename Playlist"
        placeholder="New name"
        initialValue={renameTarget?.Name || ''}
        confirmLabel="Rename"
        onClose={() => setRenameTarget(null)}
        onConfirm={handleRename}
      />

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Playlist"
        message={`Are you sure you want to delete "${deleteTarget?.Name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  )
}
