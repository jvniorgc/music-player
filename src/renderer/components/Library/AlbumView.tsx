import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { jellyfin, JellyfinItem } from '../../services/jellyfin'
import { usePlayerStore } from '../../stores/player'
import { useDownloadStore } from '../../stores/download'
import { Play, Pause, Shuffle, Download, Check, Clock, ArrowLeft } from 'lucide-react'

function formatDuration(ticks?: number): string {
  if (!ticks) return ''
  const seconds = Math.floor(ticks / 10_000_000)
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatTotalDuration(items: JellyfinItem[]): string {
  const totalTicks = items.reduce((sum, item) => sum + (item.RunTimeTicks || 0), 0)
  const totalMinutes = Math.floor(totalTicks / 10_000_000 / 60)
  if (totalMinutes < 60) return `${totalMinutes} min`
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${h} h ${m} min`
}

export default function AlbumView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [album, setAlbum] = useState<JellyfinItem | null>(null)
  const [tracks, setTracks] = useState<JellyfinItem[]>([])
  const [loading, setLoading] = useState(true)
  const { playItems, currentTrack, isPlaying, togglePlay } = usePlayerStore()
  const { isDownloaded, startDownload } = useDownloadStore()

  useEffect(() => {
    if (!id) return
    setLoading(true)

    Promise.all([
      jellyfin.getAlbumItems(id).then(r => setTracks(r.Items)),
      fetch(`${jellyfin.serverUrl}/Users/${jellyfin.userId}/Items/${id}`, {
        headers: { 'X-Emby-Authorization': `MediaBrowser Token="${jellyfin.token}"` }
      }).then(r => r.json()).then(setAlbum)
    ]).finally(() => setLoading(false))
  }, [id])

  if (loading || !album) {
    return <div className="flex items-center justify-center py-24 text-text-tertiary">Carregando...</div>
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
        Voltar
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
          <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2">Álbum</p>
          <h1 className="text-3xl font-bold tracking-tight mb-2 truncate">{album.Name}</h1>
          <p className="text-lg text-accent font-medium mb-1 truncate">
            {album.AlbumArtist || album.ArtistItems?.[0]?.Name}
          </p>
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            {album.ProductionYear && <span>{album.ProductionYear}</span>}
            {album.ProductionYear && tracks.length > 0 && <span>·</span>}
            {tracks.length > 0 && <span>{tracks.length} músicas</span>}
            {tracks.length > 0 && <span>·</span>}
            <span>{formatTotalDuration(tracks)}</span>
          </div>

          <div className="flex items-center gap-3 mt-5">
            <button
              onClick={handlePlayAll}
              className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-6 py-2.5 rounded-full font-semibold text-sm transition-colors"
            >
              {isCurrentAlbum && isPlaying ? <Pause size={16} fill="white" /> : <Play size={16} fill="white" className="ml-0.5" />}
              {isCurrentAlbum && isPlaying ? 'Pausar' : 'Reproduzir'}
            </button>
            <button
              onClick={handleShuffle}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/15 text-white px-5 py-2.5 rounded-full text-sm transition-colors"
            >
              <Shuffle size={15} />
              Aleatório
            </button>
            <button
              onClick={handleDownloadAll}
              className="p-2.5 rounded-full bg-white/10 hover:bg-white/15 transition-colors"
              title="Baixar álbum"
            >
              <Download size={16} />
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
            <div
              key={track.Id}
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
                  <span className={`text-sm tabular-nums ${isCurrent ? 'text-accent' : 'text-text-tertiary group-hover:hidden'}`}>
                    {track.IndexNumber || i + 1}
                  </span>
                )}
                {!isCurrent && (
                  <Play size={14} className="text-white hidden group-hover:block ml-auto" fill="white" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium truncate ${isCurrent ? 'text-accent' : ''}`}>
                  {track.Name}
                </p>
                {track.Artists && track.Artists.length > 0 && track.Artists[0] !== album.AlbumArtist && (
                  <p className="text-xs text-text-secondary truncate">{track.Artists.join(', ')}</p>
                )}
              </div>

              {downloaded && <Check size={14} className="text-accent shrink-0" />}

              <span className="text-xs text-text-tertiary tabular-nums shrink-0">
                {formatDuration(track.RunTimeTicks)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
