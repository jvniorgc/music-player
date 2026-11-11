import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MediaCard from '../UI/MediaCard'
import { useLibraryStore } from '../../stores/library'
import { jellyfin, JellyfinItem } from '../../services/jellyfin'
import { ListMusic, Plus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { InputModal, ConfirmModal } from '../UI/Modal'
import { useToastStore } from '../../stores/toast'
import { buttonClass } from '../UI/Button'
import { useShallow } from 'zustand/react/shallow'
import { useT } from '../../i18n'

export default function PlaylistList() {
  const { t, tn } = useT()
  const { playlists, fetchPlaylists } = useLibraryStore(useShallow(s => ({ playlists: s.playlists, fetchPlaylists: s.fetchPlaylists })))
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
      toast(t('playlist.created'), 'success')
      navigate(`/playlist/${res.Id}`)
    } catch (err) {
      console.error('Failed to create playlist:', err)
      toast(t('playlist.createFailed'), 'error')
    }
  }

  const handleRename = async (name: string) => {
    if (!renameTarget) return
    try {
      await jellyfin.renameItem(renameTarget.Id, name)
      await fetchPlaylists()
      toast(t('playlist.renamed'), 'success')
    } catch (err) {
      console.error('Failed to rename playlist:', err)
      toast(t('playlist.renameFailed'), 'error')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await jellyfin.deleteItem(deleteTarget.Id)
      await fetchPlaylists()
      toast(t('playlist.deleted'), 'success')
    } catch (err) {
      console.error('Failed to delete playlist:', err)
      toast(t('playlist.deleteFailed'), 'error')
    }
  }

  return (
    <div className="fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-title font-semibold">{t('nav.playlists')}</h1>
          {playlists.length > 0 && (
            <p className="text-sm text-text-secondary mt-1">{tn('common.playlistCount', playlists.length)}</p>
          )}
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className={buttonClass('primary')}
        >
          <Plus size={16} />
          {t('playlist.new')}
        </button>
      </div>

      {playlists.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
          {playlists.map(pl => {
            return (
              <MediaCard
                key={pl.Id}
                imageUrl={pl.ImageTags?.Primary ? jellyfin.getImageUrl(pl.Id, pl.ImageTags.Primary) : null}
                kind="playlist"
                title={pl.Name}
                onClick={() => navigate(`/playlist/${pl.Id}`)}
                onContextMenu={e => {
                  e.preventDefault()
                  setContextMenu({ id: pl.Id, x: e.clientX, y: e.clientY })
                }}
                caption={<>
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{pl.Name}</p>
                      <p className="text-xs text-text-secondary">
                        {pl.ChildCount ? tn('common.songCount', pl.ChildCount) : t('playlist.label')}
                      </p>
                    </div>
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        setContextMenu({ id: pl.Id, x: e.clientX, y: e.clientY })
                      }}
                      aria-label={t('menu.more')}
                      title={t('menu.more')}
                      className="p-1.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-white/10 text-text-tertiary transition-all shrink-0"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  </div>

                  {/* Context menu */}
                  {contextMenu?.id === pl.Id && (
                    <div
                      className="fixed z-50 bg-surface-2 border border-border rounded-lg shadow-lg shadow-black/40 py-1.5 min-w-[160px]"
                      style={{ left: contextMenu.x, top: contextMenu.y }}
                      onClick={e => e.stopPropagation()}
                    >
                      <button
                        onClick={() => { setContextMenu(null); setRenameTarget(pl) }}
                        className="flex items-center gap-3 w-full px-4 py-2 text-sm hover:bg-white/10 transition-colors"
                      >
                        <Pencil size={14} />
                        {t('playlist.rename')}
                      </button>
                      <button
                        onClick={() => { setContextMenu(null); setDeleteTarget(pl) }}
                        className="flex items-center gap-3 w-full px-4 py-2 text-sm text-danger hover:bg-white/10 transition-colors"
                      >
                        <Trash2 size={14} />
                        {t('playlist.delete')}
                      </button>
                    </div>
                  )}
                </>}
              />
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-text-tertiary">
          <ListMusic size={48} className="mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-text-secondary mb-1">{t('playlist.empty')}</h3>
          <p className="text-sm mb-4">{t('playlist.emptyHint')}</p>
          <button
            onClick={() => setShowCreate(true)}
            className={buttonClass('primary')}
          >
            <Plus size={16} />
            {t('playlist.create')}
          </button>
        </div>
      )}

      <InputModal
        open={showCreate}
        title={t('playlist.new')}
        placeholder={t('playlist.namePlaceholder')}
        confirmLabel={t('common.create')}
        onClose={() => setShowCreate(false)}
        onConfirm={handleCreate}
      />

      <InputModal
        open={!!renameTarget}
        title={t('playlist.renameTitle')}
        placeholder={t('playlist.newNamePlaceholder')}
        initialValue={renameTarget?.Name || ''}
        confirmLabel={t('playlist.rename')}
        onClose={() => setRenameTarget(null)}
        onConfirm={handleRename}
      />

      <ConfirmModal
        open={!!deleteTarget}
        title={t('playlist.deleteTitle')}
        message={t('playlist.deleteConfirm', { name: deleteTarget?.Name ?? '' })}
        confirmLabel={t('playlist.delete')}
        destructive
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  )
}
