import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { jellyfin, JellyfinItem } from '../../services/jellyfin'
import { isAbortError } from '../../services/http'
import { usePlayerStore } from '../../stores/player'
import { useDownloadStore } from '../../stores/download'
import { useLibraryStore } from '../../stores/library'
import { Play, Pause, Shuffle, Download, Check, ArrowLeft, Pencil } from 'lucide-react'
import MetadataEditor from '../Metadata/MetadataEditor'
import TrackMenu from '../UI/TrackMenu'
import AddToPlaylist from '../UI/AddToPlaylist'
import { formatTotalDuration } from '../../lib/format'
import TrackRow, { TrackIndex, TrackDuration } from '../UI/TrackRow'
import { useShallow } from 'zustand/react/shallow'

export default function AlbumView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [album, setAlbum] = useState<JellyfinItem | null>(null)
  const [tracks, setTracks] = useState<JellyfinItem[]>([])
  const [loading, setLoading] = useState(true)
  const { playItems, currentTrack, isPlaying, togglePlay } = usePlayerStore(useShallow(s => ({ playItems: s.playItems, currentTrack: s.currentTrack, isPlaying: s.isPlaying, togglePlay: s.togglePlay })))
  const { isDownloaded, startDownload } = useDownloadStore(useShallow(s => ({ isDownloaded: s.isDownloaded, startDownload: s.startDownload, downloads: s.downloads })))
  const { playlists, fetchPlaylists } = useLibraryStore(useShallow(s => ({ playlists: s.playlists, fetchPlaylists: s.fetchPlaylists })))
  const [showMetadata, setShowMetadata] = useState(false)
  const [pickerSong, setPickerSong] = useState<JellyfinItem | null>(null)

  const loadData = (signal?: AbortSignal) => {
    if (!id) return
    setLoading(true)
    Promise.all([
      jellyfin.getAlbumItems(id, signal),
      jellyfin.getItem(id, signal)
    ])
      .then(([res, item]) => {
        if (signal?.aborted) return
        setTracks(res.Items)
        setAlbum(item)
      })
      .catch(err => {
        if (!isAbortError(err) && !signal?.aborted) console.warn('[AlbumView] failed to load', id, err)
      })
      .finally(() => { if (!signal?.aborted) setLoading(false) })
  }

  useEffect(() => {
    const controller = new AbortController()
    loadData(controller.signal)
    return () => controller.abort()
  }, [id])

  useEffect(() => {
    if (playlists.length === 0) fetchPlaylists()
  }, [])

  if (loading || !album) {
    return <div className="flex items-center justify-center py-24 text-text-tertiary">Loading...</div>
  }

  const imageUrl = jellyfin.getImageUrl(album.Id, album.ImageTags?.Primary, 600)
  const isCurrentAlbum = currentTrack && tracks.some(t => t.Id === currentTrack.id)

  const handlePlayAll = () => {
    if (isCurrentAlbum && isPlaying) {
      togglePlay()
    } else {
      playItems(tracks)
    }
  }

  const handleShuffle = () => {
    const shuffled = [...tracks].sort(() => Math.random() - 0.5)
    playItems(shuffled)
  }

  const handleDownloadAll = () => {
    tracks.forEach(track => {
      if (!isDownloaded(track.Id)) {
        startDownload(track)
      }
    })
  }

  return (
    <div className="fade-in">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-accent hover:text-accent-hover text-sm mb-6 transition-colors"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      {/* Header */}
      <div className="flex gap-8 mb-8">
        <div className="w-56 h-56 rounded-2xl overflow-hidden bg-bg-elevated shadow-2xl shadow-black/30 shrink-0">
          {album.ImageTags?.Primary ? (
            <img src={imageUrl} className="w-full h-full object-cover" alt="" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-bg-elevated to-bg-tertiary">
              <span className="text-6xl">💿</span>
            </div>
          )}
        </div>

        <div className="flex flex-col justify-end min-w-0">
          <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2">Album</p>
          <h1 className="text-3xl font-bold tracking-tight mb-2 truncate">{album.Name}</h1>
          <p className="text-lg text-accent font-medium mb-1 truncate">
            {album.ArtistItems && album.ArtistItems.length > 0 ? (
              album.ArtistItems.map((a, i) => (
                <span key={a.Id}>
                  {i > 0 && ', '}
                  <button
                    className="hover:underline cursor-pointer"
                    onClick={() => navigate(`/artist/${a.Id}`)}
                  >
                    {a.Name}
                  </button>
                </span>
              ))
            ) : (
              album.AlbumArtist || ''
            )}
          </p>
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            {album.ProductionYear && <span>{album.ProductionYear}</span>}
            {album.ProductionYear && tracks.length > 0 && <span>·</span>}
            {tracks.length > 0 && <span>{tracks.length} songs</span>}
            {tracks.length > 0 && <span>·</span>}
            <span>{formatTotalDuration(tracks)}</span>
          </div>

          <div className="flex items-center gap-3 mt-5">
            <button
              onClick={handlePlayAll}
              className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-6 py-2.5 rounded-full font-semibold text-sm transition-colors"
            >
              {isCurrentAlbum && isPlaying ? <Pause size={16} fill="white" /> : <Play size={16} fill="white" className="ml-0.5" />}
              {isCurrentAlbum && isPlaying ? 'Pause' : 'Play'}
            </button>
            <button
              onClick={handleShuffle}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/15 text-white px-5 py-2.5 rounded-full text-sm transition-colors"
            >
              <Shuffle size={15} />
              Shuffle
            </button>
            <button
              onClick={handleDownloadAll}
              className="p-2.5 rounded-full bg-white/10 hover:bg-white/15 transition-colors"
              title="Download album"
            >
              <Download size={16} />
            </button>
            <button
              onClick={() => setShowMetadata(true)}
              className="p-2.5 rounded-full bg-white/10 hover:bg-white/15 transition-colors"
              title="Edit metadata"
            >
              <Pencil size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Track list */}
      <div className="bg-bg-secondary/40 rounded-xl overflow-hidden">
        {tracks.map((track, i) => {
          const isCurrent = currentTrack?.id === track.Id
          const downloaded = isDownloaded(track.Id)

          return (
            <TrackRow
              key={track.Id}
              isCurrent={isCurrent}
              onClick={() => playItems(tracks, i)}
              leading={<TrackIndex number={track.IndexNumber || i + 1} isCurrent={isCurrent} isPlaying={isPlaying} className="w-7" />}
              title={track.Name}
              subtitle={track.Artists && track.Artists.length > 0 && track.Artists[0] !== album.AlbumArtist && track.Artists.join(', ')}
            >
              {downloaded && <Check size={14} className="text-accent shrink-0" />}

              <TrackDuration ticks={track.RunTimeTicks} />

              <TrackMenu track={track} onPlaylistAdd={(t) => setPickerSong(t)} />
            </TrackRow>
          )
        })}
      </div>

      <MetadataEditor
        album={album}
        tracks={tracks}
        open={showMetadata}
        onClose={() => setShowMetadata(false)}
        onApplied={() => loadData()}
      />

      <AddToPlaylist song={pickerSong} onClose={() => setPickerSong(null)} />
    </div>
  )
}
