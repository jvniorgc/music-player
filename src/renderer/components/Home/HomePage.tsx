import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibraryStore } from '../../stores/library'
import { usePlayerStore } from '../../stores/player'
import { jellyfin, JellyfinItem } from '../../services/jellyfin'
import { Play, Clock } from 'lucide-react'

function formatDuration(ticks?: number): string {
  if (!ticks) return ''
  const seconds = Math.floor(ticks / 10_000_000)
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function AlbumCard({ item, onClick }: { item: JellyfinItem; onClick: () => void }) {
  const imageUrl = jellyfin.getImageUrl(item.Id, item.ImageTags?.Primary)
  const { playItems } = usePlayerStore()

  const handlePlay = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const res = await jellyfin.getAlbumItems(item.Id)
      if (res.Items.length > 0) playItems(res.Items)
    } catch (err) {
      console.error('Failed to play album:', err)
    }
  }

  return (
    <div
      className="group cursor-pointer"
      onClick={onClick}
    >
      <div className="relative aspect-square rounded-xl overflow-hidden bg-bg-elevated mb-3 shadow-lg shadow-black/20">
        {item.ImageTags?.Primary ? (
          <img src={imageUrl} className="w-full h-full object-cover" alt="" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-bg-elevated to-bg-tertiary">
            <span className="text-4xl">🎵</span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
        <button
          onClick={handlePlay}
          className="absolute bottom-3 right-3 w-10 h-10 bg-accent rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 transform translate-y-1 group-hover:translate-y-0 shadow-lg shadow-black/30"
        >
          <Play size={18} className="text-white ml-0.5" fill="white" />
        </button>
      </div>
      <p className="text-sm font-medium truncate">{item.Name}</p>
      <p className="text-xs text-text-secondary truncate">
        {item.AlbumArtist || item.ArtistItems?.[0]?.Name || ''}
        {item.ProductionYear ? ` · ${item.ProductionYear}` : ''}
      </p>
    </div>
  )
}

function TrackRow({ item, index, items }: { item: JellyfinItem; index: number; items: JellyfinItem[] }) {
  const { playItems } = usePlayerStore()
  const imageUrl = item.AlbumId ? jellyfin.getImageUrl(item.AlbumId, undefined, 80) : null

  return (
    <div
      className="flex items-center gap-4 px-4 py-2.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer group"
      onClick={() => playItems(items, index)}
    >
      <div className="w-10 h-10 rounded overflow-hidden bg-bg-elevated shrink-0 relative">
        {imageUrl ? (
          <img src={imageUrl} className="w-full h-full object-cover" alt="" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-lg">🎵</span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors">
          <Play size={14} className="text-white opacity-0 group-hover:opacity-100 ml-0.5" fill="white" />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{item.Name}</p>
        <p className="text-xs text-text-secondary truncate">
          {item.Artists?.join(', ') || item.AlbumArtist || 'Desconhecido'}
          {item.Album ? ` — ${item.Album}` : ''}
        </p>
      </div>
      <span className="text-xs text-text-tertiary tabular-nums shrink-0">
        {formatDuration(item.RunTimeTicks)}
      </span>
    </div>
  )
}

export default function HomePage() {
  const { recentlyAdded, recentlyPlayed, isLoading, fetchHome } = useLibraryStore()
  const navigate = useNavigate()

  useEffect(() => {
    fetchHome()
  }, [])

  return (
    <div className="space-y-10 fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Ouvir Agora</h1>
      </div>

      {/* Recently Added Albums */}
      {recentlyAdded.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Adicionados Recentemente</h2>
            <button
              onClick={() => navigate('/albums')}
              className="text-sm text-accent hover:text-accent-hover transition-colors"
            >
              Ver Todos
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
            {recentlyAdded.slice(0, 12).map((item, idx) => {
              // Show exactly 2 rows per breakpoint:
              // xs=2cols→4, sm=3cols→6, md=4cols→8, lg=5cols→10, xl=6cols→12
              let cls = ''
              if (idx >= 10) cls = 'hidden xl:block'
              else if (idx >= 8) cls = 'hidden lg:block'
              else if (idx >= 6) cls = 'hidden md:block'
              else if (idx >= 4) cls = 'hidden sm:block'
              return (
                <div key={item.Id} className={cls}>
                  <AlbumCard item={item} onClick={() => navigate(`/album/${item.Id}`)} />
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Recently Played */}
      {recentlyPlayed.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Tocados Recentemente</h2>
          </div>
          <div className="bg-bg-secondary/40 rounded-xl overflow-hidden">
            {recentlyPlayed.slice(0, 10).map((item, i) => (
              <TrackRow key={item.Id} item={item} index={i} items={recentlyPlayed} />
            ))}
          </div>
        </section>
      )}

      {!isLoading && recentlyAdded.length === 0 && recentlyPlayed.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-text-tertiary">
          <Clock size={48} className="mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-text-secondary mb-1">Sua biblioteca está vazia</h3>
          <p className="text-sm">Adicione músicas ao seu servidor Jellyfin para começar</p>
        </div>
      )}
    </div>
  )
}
