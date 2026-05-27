import { useEffect, useRef, useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibraryStore } from '../../stores/library'
import { usePlayerStore } from '../../stores/player'
import { jellyfin, JellyfinItem } from '../../services/jellyfin'
import { Play, Loader2 } from 'lucide-react'

type SortOption = 'alphabetical' | 'recent'

export default function AlbumGrid() {
  const { albums, totalAlbums, isLoading, fetchAlbums, loadMoreAlbums } = useLibraryStore()
  const navigate = useNavigate()
  const loaderRef = useRef<HTMLDivElement>(null)
  const [sort, setSort] = useState<SortOption>('alphabetical')
  const [localAlbums, setLocalAlbums] = useState<JellyfinItem[]>([])
  const [localTotal, setLocalTotal] = useState(0)
  const [localLoading, setLocalLoading] = useState(false)

  const isDefault = sort === 'alphabetical'
  const displayAlbums = isDefault ? albums : localAlbums
  const displayTotal = isDefault ? totalAlbums : localTotal
  const displayLoading = isDefault ? isLoading : localLoading

  useEffect(() => {
    if (sort === 'alphabetical') {
      if (albums.length === 0) fetchAlbums()
    } else {
      setLocalLoading(true)
      jellyfin.getAlbums(0, 100, 'DateCreated', 'Descending').then(res => {
        setLocalAlbums(res.Items)
        setLocalTotal(res.TotalRecordCount)
        setLocalLoading(false)
      }).catch(() => setLocalLoading(false))
    }
  }, [sort])

  const loadMore = useCallback(async () => {
    if (isDefault) {
      loadMoreAlbums()
    } else {
      if (localAlbums.length >= localTotal) return
      setLocalLoading(true)
      try {
        const res = await jellyfin.getAlbums(localAlbums.length, 100, 'DateCreated', 'Descending')
        setLocalAlbums(prev => [...prev, ...res.Items])
        setLocalTotal(res.TotalRecordCount)
      } finally {
        setLocalLoading(false)
      }
    }
  }, [isDefault, localAlbums.length, localTotal])

  // Infinite scroll
  const observerCallback = useCallback((entries: IntersectionObserverEntry[]) => {
    if (entries[0].isIntersecting && !displayLoading && displayAlbums.length < displayTotal) {
      loadMore()
    }
  }, [displayLoading, displayAlbums.length, displayTotal, loadMore])

  useEffect(() => {
    const observer = new IntersectionObserver(observerCallback, { threshold: 0.1 })
    if (loaderRef.current) observer.observe(loaderRef.current)
    return () => observer.disconnect()
  }, [observerCallback])

  return (
    <div className="fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Albums</h1>
          {displayTotal > 0 && (
            <p className="text-sm text-text-secondary mt-1">{displayTotal} albums</p>
          )}
        </div>
        <select
          value={sort}
          onChange={e => setSort(e.target.value as SortOption)}
          className="bg-bg-elevated border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
        >
          <option value="alphabetical">A–Z</option>
          <option value="recent">Recently added</option>
        </select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
        {displayAlbums.map(item => (
          <AlbumCard
            key={item.Id}
            item={item}
            onClick={() => navigate(`/album/${item.Id}`)}
          />
        ))}
      </div>

      <div ref={loaderRef} className="py-8 flex justify-center">
        {displayLoading && <Loader2 size={24} className="animate-spin text-text-tertiary" />}
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
