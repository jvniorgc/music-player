import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibraryStore } from '../../stores/library'
import { jellyfin, JellyfinItem } from '../../services/jellyfin'
import { Loader2 } from 'lucide-react'

export default function ArtistGrid() {
  const { artists, totalArtists, isLoading, fetchArtists } = useLibraryStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (artists.length === 0) fetchArtists()
  }, [])

  return (
    <div className="fade-in">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Artists</h1>
        {totalArtists > 0 && (
          <p className="text-sm text-text-secondary mt-1">{totalArtists} artistas</p>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
        {artists.map(artist => (
          <ArtistCard
            key={artist.Id}
            item={artist}
            onClick={() => navigate(`/artist/${artist.Id}`)}
          />
        ))}
      </div>

      {isLoading && (
        <div className="py-8 flex justify-center">
          <Loader2 size={24} className="animate-spin text-text-tertiary" />
        </div>
      )}
    </div>
  )
}

function ArtistCard({ item, onClick }: { item: JellyfinItem; onClick: () => void }) {
  const imageUrl = item.ImageTags?.Primary
    ? jellyfin.getImageUrl(item.Id, item.ImageTags.Primary)
    : null

  return (
    <div className="group cursor-pointer text-center" onClick={onClick}>
      <div className="relative aspect-square rounded-full overflow-hidden bg-bg-elevated mb-3 mx-auto shadow-lg shadow-black/20">
        {imageUrl ? (
          <img src={imageUrl} className="w-full h-full object-cover" alt="" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-bg-elevated to-bg-tertiary">
            <span className="text-4xl">🎤</span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-full" />
      </div>
      <p className="text-sm font-medium truncate">{item.Name}</p>
      {(item.AlbumCount || item.SongCount) && (
        <p className="text-xs text-text-secondary">
          {item.AlbumCount ? `${item.AlbumCount} albums` : ''}
        </p>
      )}
    </div>
  )
}
