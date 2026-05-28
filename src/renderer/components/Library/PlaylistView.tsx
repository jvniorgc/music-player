import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { jellyfin, JellyfinItem } from '../../services/jellyfin'
import { usePlayerStore } from '../../stores/player'
import { useLibraryStore } from '../../stores/library'
import { useToastStore } from '../../stores/toast'
import { Play, Pause, Shuffle, ListMusic, ArrowLeft, Pencil, Trash2, X as XIcon } from 'lucide-react'
import { InputModal, ConfirmModal } from '../UI/Modal'
import TrackMenu from '../UI/TrackMenu'

function formatDuration(ticks?: number): string {
  if (!ticks) return ''
  const seconds = Math.floor(ticks / 10_000_000)
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function PlaylistView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [playlist, setPlaylist] = useState<JellyfinItem | null>(null)
  const [tracks, setTracks] = useState<JellyfinItem[]>([])
  const [loading, setLoading] = useState(true)
  const { playItems, currentTrack, isPlaying, togglePlay } = usePlayerStore()
  const { fetchPlaylists } = useLibraryStore()
  const toast = useToastStore(s => s.show)

  const [showRename, setShowRename] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  const loadData = () => {
    if (!id) return
    setLoading(true)
    Promise.all([
      jellyfin.getPlaylistItems(id).then(r => setTracks(r.Items)),
      fetch(`${jellyfin.serverUrl}/Users/${jellyfin.userId}/Items/${id}`, {
        headers: { 'X-Emby-Authorization': `MediaBrowser Token="${jellyfin.token}"` }
      }).then(r => r.json()).then(setPlaylist)
    ]).finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [id])

  const handleRename = async (name: string) => {
    if (!id) return
    try {
      await jellyfin.renameItem(id, name)
      setPlaylist(prev => prev ? { ...prev, Name: name } : prev)
      fetchPlaylists()
      toast('Playlist renamed', 'success')
    } catch (err) {
      console.error('Failed to rename playlist:', err)
      toast('Could not rename this playlist', 'error')
    }
  }

  const handleDelete = async () => {
    if (!id) return
    try {
      await jellyfin.deleteItem(id)
      fetchPlaylists()
      toast('Playlist deleted', 'success')
      navigate('/playlists')
    } catch (err) {
      console.error('Failed to delete playlist:', err)
      toast('Could not delete. File-based playlists cannot be deleted.', 'error')
    }
  }

  const handleRemoveTrack = async (track: JellyfinItem) => {
    if (!id || !track.PlaylistItemId) return
    try {
      await jellyfin.removeFromPlaylist(id, [track.PlaylistItemId])
      setTracks(prev => prev.filter(t => t.PlaylistItemId !== track.PlaylistItemId))
      toast('Song removed from playlist', 'success')
    } catch (err) {
      console.error('Failed to remove track:', err)
      toast('Could not remove. The playlist may be read-only.', 'error')
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-text-tertiary">Loading...</div>
  }

  const imageUrl = playlist?.ImageTags?.Primary
    ? jellyfin.getImageUrl(playlist.Id, playlist.ImageTags.Primary, 600)
    : null

  const isCurrentPlaylist = currentTrack && tracks.some(t => t.Id === currentTrack.id)

  return (
    <div className="fade-in">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-accent hover:text-accent-hover text-sm mb-6 transition-colors"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <div className="flex gap-8 mb-8">
        <div className="w-56 h-56 rounded-2xl overflow-hidden bg-bg-elevated shadow-2xl shrink-0">
          {imageUrl ? (
            <img src={imageUrl} className="w-full h-full object-cover" alt="" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-accent/20 to-pink-600/20">
              <ListMusic size={64} className="text-accent/60" />
            </div>
          )}
        </div>

        <div className="flex flex-col justify-end min-w-0">
          <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2">Playlist</p>
          <h1 className="text-3xl font-bold truncate">{playlist?.Name}</h1>
          <p className="text-sm text-text-secondary mt-2">{tracks.length} songs</p>

          <div className="flex items-center gap-3 mt-5">
            <button
              onClick={() => {
                if (isCurrentPlaylist && isPlaying) togglePlay()
                else playItems(tracks)
              }}
              className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-6 py-2.5 rounded-full font-semibold text-sm transition-colors"
            >
              {isCurrentPlaylist && isPlaying ? <Pause size={16} fill="white" /> : <Play size={16} fill="white" className="ml-0.5" />}
              {isCurrentPlaylist && isPlaying ? 'Pause' : 'Play'}
            </button>
            <button
              onClick={() => {
                const shuffled = [...tracks].sort(() => Math.random() - 0.5)
                playItems(shuffled)
              }}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/15 text-white px-5 py-2.5 rounded-full text-sm transition-colors"
            >
              <Shuffle size={15} />
              Shuffle
            </button>
            <button
              onClick={() => setShowRename(true)}
              className="p-2.5 rounded-full bg-white/10 hover:bg-white/15 text-text-secondary hover:text-text-primary transition-colors"
              title="Rename"
            >
              <Pencil size={15} />
            </button>
            <button
              onClick={() => setShowDelete(true)}
              className="p-2.5 rounded-full bg-white/10 hover:bg-white/15 text-text-secondary hover:text-red-400 transition-colors"
              title="Delete"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      </div>

      {tracks.length > 0 ? (
        <div className="bg-bg-secondary/40 rounded-xl overflow-hidden">
          {tracks.map((track, i) => {
            const isCurrent = currentTrack?.id === track.Id
            const albumImage = track.AlbumId ? jellyfin.getImageUrl(track.AlbumId, undefined, 80) : null

            return (
              <div
                key={`${track.Id}-${i}`}
                className={`flex items-center gap-4 px-5 py-3 hover:bg-white/5 transition-colors cursor-pointer group ${
                  isCurrent ? 'bg-white/5' : ''
                }`}
                onClick={() => playItems(tracks, i)}
              >
                <div className="w-7 text-right">
                  {isCurrent && isPlaying ? (
                    <div className="flex items-center justify-end gap-[2px]">
                      <div className="w-[3px] h-3 bg-accent rounded-full animate-pulse" />
                      <div className="w-[3px] h-4 bg-accent rounded-full animate-pulse" style={{ animationDelay: '0.15s' }} />
                      <div className="w-[3px] h-2 bg-accent rounded-full animate-pulse" style={{ animationDelay: '0.3s' }} />
                    </div>
                  ) : (
                    <>
                      <span className={`text-sm tabular-nums group-hover:hidden ${isCurrent ? 'text-accent' : 'text-text-tertiary'}`}>
                        {i + 1}
                      </span>
                      <Play size={14} className="text-white hidden group-hover:block ml-auto" fill="white" />
                    </>
                  )}
                </div>

                {albumImage ? (
                  <img src={albumImage} className="w-10 h-10 rounded object-cover" alt="" loading="lazy" />
                ) : (
                  <div className="w-10 h-10 rounded bg-bg-elevated flex items-center justify-center">
                    <ListMusic size={16} className="text-text-tertiary" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium truncate ${isCurrent ? 'text-accent' : ''}`}>{track.Name}</p>
                  <p className="text-xs text-text-secondary truncate">
                    {track.Artists?.join(', ') || track.AlbumArtist || 'Unknown'}
                    {track.Album ? ` — ${track.Album}` : ''}
                  </p>
                </div>

                <span className="text-xs text-text-tertiary tabular-nums shrink-0">
                  {formatDuration(track.RunTimeTicks)}
                </span>

                <TrackMenu
                  track={track}
                  extraItems={
                    <button
                      onClick={() => handleRemoveTrack(track)}
                      className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-400 hover:bg-white/10 transition-colors"
                    >
                      <XIcon size={14} />
                      Remove from Playlist
                    </button>
                  }
                />
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-text-tertiary">
          <ListMusic size={40} className="mb-3 opacity-50" />
          <p className="text-sm">Empty playlist</p>
        </div>
      )}

      <InputModal
        open={showRename}
        title="Rename Playlist"
        placeholder="New name"
        initialValue={playlist?.Name || ''}
        confirmLabel="Rename"
        onClose={() => setShowRename(false)}
        onConfirm={handleRename}
      />

      <ConfirmModal
        open={showDelete}
        title="Delete Playlist"
        message={`Are you sure you want to delete "${playlist?.Name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
      />
    </div>
  )
}
