import { useState } from 'react'
import { jellyfin, type JellyfinItem } from '../../services/jellyfin'
import { useLibraryStore } from '../../stores/library'
import { useToastStore } from '../../stores/toast'
import { PlaylistPicker, InputModal } from './Modal'
import { useT } from '../../i18n'

export interface AddToPlaylistProps {
  /** Song(s) to add; the picker is open while non-null. */
  song: JellyfinItem | JellyfinItem[] | null
  onClose: () => void
}

/** Playlist picker plus "new playlist" prompt for adding a single song. */
export default function AddToPlaylist({ song, onClose }: AddToPlaylistProps) {
  const { t } = useT()
  const playlists = useLibraryStore(s => s.playlists)
  const fetchPlaylists = useLibraryStore(s => s.fetchPlaylists)
  const toast = useToastStore(s => s.show)
  const [pendingSong, setPendingSong] = useState<JellyfinItem | JellyfinItem[] | null>(null)
  const ids = (s: JellyfinItem | JellyfinItem[]) => (Array.isArray(s) ? s : [s]).map(i => i.Id)

  const handleAdd = async (playlistId: string) => {
    if (!song) return
    try {
      await jellyfin.addToPlaylist(playlistId, ids(song))
      toast(t('playlist.added'), 'success')
    } catch (err) {
      console.error('Failed to add to playlist:', err)
      toast(t('playlist.addFailed'), 'error')
    }
    onClose()
  }

  const handleCreate = async (name: string) => {
    if (!pendingSong) return
    try {
      await jellyfin.createPlaylist(name, ids(pendingSong))
      fetchPlaylists()
      toast(t('playlist.created'), 'success')
    } catch (err) {
      console.error('Failed to create playlist:', err)
      toast(t('playlist.createFailed'), 'error')
    }
    setPendingSong(null)
  }

  return (
    <>
      <PlaylistPicker
        open={!!song}
        playlists={playlists}
        onClose={onClose}
        onSelect={handleAdd}
        onCreate={() => {
          setPendingSong(song)
          onClose()
        }}
      />
      <InputModal
        open={!!pendingSong}
        title={t('playlist.new')}
        placeholder={t('playlist.namePlaceholder')}
        confirmLabel={t('common.create')}
        onClose={() => setPendingSong(null)}
        onConfirm={handleCreate}
      />
    </>
  )
}
