import { useState } from 'react'
import { jellyfin, type JellyfinItem } from '../../services/jellyfin'
import { useLibraryStore } from '../../stores/library'
import { useToastStore } from '../../stores/toast'
import { PlaylistPicker, InputModal } from './Modal'

export interface AddToPlaylistProps {
  /** Song to add; the picker is open while non-null. */
  song: JellyfinItem | null
  onClose: () => void
}

/** Playlist picker plus "new playlist" prompt for adding a single song. */
export default function AddToPlaylist({ song, onClose }: AddToPlaylistProps) {
  const playlists = useLibraryStore(s => s.playlists)
  const fetchPlaylists = useLibraryStore(s => s.fetchPlaylists)
  const toast = useToastStore(s => s.show)
  const [pendingSong, setPendingSong] = useState<JellyfinItem | null>(null)

  const handleAdd = async (playlistId: string) => {
    if (!song) return
    try {
      await jellyfin.addToPlaylist(playlistId, [song.Id])
      toast('Added to playlist', 'success')
    } catch (err) {
      console.error('Failed to add to playlist:', err)
      toast('Could not add to playlist', 'error')
    }
    onClose()
  }

  const handleCreate = async (name: string) => {
    if (!pendingSong) return
    try {
      await jellyfin.createPlaylist(name, [pendingSong.Id])
      fetchPlaylists()
      toast('Playlist created', 'success')
    } catch (err) {
      console.error('Failed to create playlist:', err)
      toast('Error creating playlist', 'error')
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
        title="New playlist"
        placeholder="Playlist name"
        confirmLabel="Create"
        onClose={() => setPendingSong(null)}
        onConfirm={handleCreate}
      />
    </>
  )
}
