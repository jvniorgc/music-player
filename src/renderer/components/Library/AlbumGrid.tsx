import { useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibraryStore } from '../../stores/library'
import { usePlayerStore } from '../../stores/player'
import { jellyfin, JellyfinItem } from '../../services/jellyfin'
import { Play, Loader2 } from 'lucide-react'

export default function AlbumGrid() {
  const { albums, totalAlbums, isLoading, fetchAlbums, loadMoreAlbums } = useLibraryStore()
  const navigate = useNavigate()
  const loaderRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (albums.length === 0) fetchAlbums()
  }, [])

  // Infinite scroll
  const observerCallback = useCallback((entries: IntersectionObserverEntry[]) => {
    if (entries[0].isIntersecting && !isLoading && albums.length < totalAlbums) {
      loadMoreAlbums()
    }
  }, [isLoading, albums.length, totalAlbums])

  useEffect(() => {
    const observer = new IntersectionObserver(observerCallback, { threshold: 0.1 })
    if (loaderRef.current) observer.observe(loaderRef.current)
    return () => observer.disconnect()
  }, [observerCallback])

  return (
    <div className="fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Álbuns</h1>
          {totalAlbums > 0 && (
            <p className="text-sm text-text-secondary mt-1">{totalAlbums} álbuns</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
        {albums.map(item => (
          <AlbumCard
            key={item.Id}
            item={item}
            onClick={() => navigate(`/album/${item.Id}`)}
          />
        ))}
      </div>

      <div ref={loaderRef} className="py-8 flex justify-center">
        {isLoading && <Loader2 size={24} className="animate-spin text-text-tertiary" />}
      </div>
    </div>
  )
}

function AlbumCard({ item, onClick }: { item: JellyfinItem; onClick: () => void }) {
  const imageUrl = jellyfin.getImageUrl(item.Id, item.ImageTags?.Primary)
  const { playItems } = usePlayerStore()

  const handlePlay = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const res = await jellyfin.getAlbumItems(item.Id)
      if (res.Items.length > 0) playItems(res.Items)
    } catch {}
  }

  return (
    <div className="group cursor-pointer" onClick={onClick}>
      <div className="relative aspect-square rounded-xl overflow-hidden bg-bg-elevated mb-3 shadow-lg shadow-black/20">
        {item.ImageTags?.Primary ? (
          <img src={imageUrl} className="w-full h-full object-cover" alt="" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-bg-elevated to-bg-tertiary">
            <span className="text-4xl">💿</span>
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
