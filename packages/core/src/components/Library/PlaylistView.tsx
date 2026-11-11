import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { jellyfin, JellyfinItem } from '../../services/jellyfin'
import { isAbortError } from '../../services/http'
import { usePlayerStore } from '../../stores/player'
import type { PlaybackContext } from '../../services/playback'
import { useLibraryStore } from '../../stores/library'
import { useToastStore } from '../../stores/toast'
import { Play, Pause, Shuffle, ListMusic, Pencil, Trash2, X as XIcon } from 'lucide-react'
import { InputModal, ConfirmModal } from '../UI/Modal'
import TrackMenu from '../UI/TrackMenu'
import { TrackSubtitle } from '../UI/Links'
import TrackRow, { TrackIndex, TrackDuration } from '../UI/TrackRow'
import CoverArt from '../UI/CoverArt'
import { buttonClass } from '../UI/Button'
import { CoverFallbackIcon } from '../UI/CoverArt'
import { useShallow } from 'zustand/react/shallow'
import { useT } from '../../i18n'
import { usePopularityActive, TrackPopularity } from '../UI/Popularity'

export default function PlaylistView() {
  const { t, tn } = useT()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [playlist, setPlaylist] = useState<JellyfinItem | null>(null)
  const [tracks, setTracks] = useState<JellyfinItem[]>([])
  const [loading, setLoading] = useState(true)
  const { playItems, shuffleItems, currentTrack, isPlaying, togglePlay } = usePlayerStore(useShallow(s => ({ playItems: s.playItems, shuffleItems: s.shuffleItems, currentTrack: s.currentTrack, isPlaying: s.isPlaying, togglePlay: s.togglePlay })))
  const fetchPlaylists = useLibraryStore(s => s.fetchPlaylists)
  const toast = useToastStore(s => s.show)

  const [showRename, setShowRename] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const showPopularity = usePopularityActive()

  const loadData = (signal?: AbortSignal) => {
    if (!id) return
    setLoading(true)
    Promise.all([
      jellyfin.getPlaylistItems(id, signal),
      jellyfin.getItem(id, signal)
    ])
      .then(([res, item]) => {
        if (signal?.aborted) return
        setTracks(res.Items)
        setPlaylist(item)
      })
      .catch(err => {
        if (!isAbortError(err) && !signal?.aborted) console.warn('[PlaylistView] failed to load', id, err)
      })
      .finally(() => { if (!signal?.aborted) setLoading(false) })
  }

  useEffect(() => {
    const controller = new AbortController()
    loadData(controller.signal)
    return () => controller.abort()
  }, [id])

  const handleRename = async (name: string) => {
    if (!id) return
    try {
      await jellyfin.renameItem(id, name)
      setPlaylist(prev => prev ? { ...prev, Name: name } : prev)
      fetchPlaylists()
      toast(t('playlist.renamed'), 'success')
    } catch (err) {
      console.error('Failed to rename playlist:', err)
      toast(t('playlist.renameThisFailed'), 'error')
    }
  }

  const handleDelete = async () => {
    if (!id) return
    try {
      await jellyfin.deleteItem(id)
      fetchPlaylists()
      toast(t('playlist.deleted'), 'success')
      navigate('/playlists')
    } catch (err) {
      console.error('Failed to delete playlist:', err)
      toast(t('playlist.deleteFileFailed'), 'error')
    }
  }

  const handleRemoveTrack = async (track: JellyfinItem) => {
    if (!id || !track.PlaylistItemId) return
    try {
      await jellyfin.removeFromPlaylist(id, [track.PlaylistItemId])
      setTracks(prev => prev.filter(t => t.PlaylistItemId !== track.PlaylistItemId))
      toast(t('playlist.trackRemoved'), 'success')
    } catch (err) {
      console.error('Failed to remove track:', err)
      toast(t('playlist.removeFailed'), 'error')
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-text-tertiary">{t('common.loading')}</div>
  }

  const imageUrl = playlist?.ImageTags?.Primary
    ? jellyfin.getImageUrl(playlist.Id, playlist.ImageTags.Primary, 600)
    : null

  const playlistContext: PlaybackContext = { type: 'playlist', id: id || '', name: playlist?.Name || t('playlist.label') }
  const isCurrentPlaylist = currentTrack && tracks.some(t => t.Id === currentTrack.id)

  return (
    <div className="fade-in">

      <div className="flex gap-8 mb-8">
        <div className="w-56 h-56 rounded-lg overflow-hidden bg-surface-2 shadow-lg shrink-0">
          {imageUrl ? (
            <img src={imageUrl} className="w-full h-full object-cover" alt="" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-surface-2">
              <CoverFallbackIcon kind="playlist" size={64} />
            </div>
          )}
        </div>

        <div className="flex flex-col justify-end min-w-0">
          <p className="text-xs font-medium text-text-tertiary mb-2">{t('playlist.label')}</p>
          <h1 className="text-title font-semibold truncate">{playlist?.Name}</h1>
          <p className="text-sm text-text-secondary mt-2">{tn('common.songCount', tracks.length)}</p>

          <div className="flex items-center gap-3 mt-5">
            <button
              onClick={() => {
                if (isCurrentPlaylist && isPlaying) togglePlay()
                else playItems(tracks, 0, playlistContext)
              }}
              className={buttonClass('primary')}
            >
              {isCurrentPlaylist && isPlaying ? <Pause size={16} fill="white" /> : <Play size={16} fill="white" className="ml-0.5" />}
              {isCurrentPlaylist && isPlaying ? t('common.pause') : t('common.play')}
            </button>
            <button
              onClick={() => {
                shuffleItems(tracks, playlistContext)
              }}
              className={buttonClass('secondary')}
            >
              <Shuffle size={15} />
              {t('common.shuffle')}
            </button>
            <button
              onClick={() => setShowRename(true)}
              className="w-8 h-8 inline-flex items-center justify-center rounded-full border border-border text-text-secondary hover:text-text-primary hover:bg-white/10 transition-colors"
              title={t('playlist.rename')}
              aria-label={t('playlist.rename')}
            >
              <Pencil size={15} />
            </button>
            <button
              onClick={() => setShowDelete(true)}
              className="w-8 h-8 inline-flex items-center justify-center rounded-full border border-border text-text-secondary hover:text-danger hover:bg-white/10 transition-colors"
              title={t('playlist.delete')}
              aria-label={t('playlist.delete')}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      </div>

      {tracks.length > 0 ? (
        <div>
          {tracks.map((track, i) => {
            const isCurrent = currentTrack?.id === track.Id

            return (
              <TrackRow
                key={`${track.Id}-${i}`}
                isCurrent={isCurrent}
                onClick={() => playItems(tracks, i, playlistContext)}
                leading={
                  <>
                    <TrackIndex number={i + 1} isCurrent={isCurrent} isPlaying={isPlaying} className="w-7" />
                    <CoverArt
                      src={track.AlbumId ? jellyfin.getImageUrl(track.AlbumId, undefined, 80) : null}
                      className="w-10 h-10 rounded overflow-hidden bg-surface-2 shrink-0"
                      kind="track"
                    />
                  </>
                }
                title={track.Name}
                subtitle={<TrackSubtitle item={track} />}
              >
                {showPopularity && id && <TrackPopularity item={track} group={id} />}

                <TrackDuration ticks={track.RunTimeTicks} />

                <TrackMenu track={track} onRemove={track.PlaylistItemId ? () => handleRemoveTrack(track) : undefined} />
              </TrackRow>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-text-tertiary">
          <ListMusic size={40} className="mb-3 opacity-50" />
          <p className="text-sm">{t('playlist.emptyPlaylist')}</p>
        </div>
      )}

      <InputModal
        open={showRename}
        title={t('playlist.renameTitle')}
        placeholder={t('playlist.newNamePlaceholder')}
        initialValue={playlist?.Name || ''}
        confirmLabel={t('playlist.rename')}
        onClose={() => setShowRename(false)}
        onConfirm={handleRename}
      />

      <ConfirmModal
        open={showDelete}
        title={t('playlist.deleteTitle')}
        message={t('playlist.deleteConfirm', { name: playlist?.Name ?? '' })}
        confirmLabel={t('playlist.delete')}
        destructive
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
      />

    </div>
  )
}
