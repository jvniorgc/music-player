import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibraryStore } from '../../stores/library'
import { Loader2 } from 'lucide-react'
import { ArtistCard } from '../UI/MediaCard'
import { useShallow } from 'zustand/react/shallow'

export default function ArtistGrid() {
  const { artists, totalArtists, isLoading, fetchArtists } = useLibraryStore(useShallow(s => ({ artists: s.artists, totalArtists: s.totalArtists, isLoading: s.isLoading, fetchArtists: s.fetchArtists })))
  const navigate = useNavigate()

  useEffect(() => {
    if (artists.length === 0) fetchArtists()
  }, [])

  return (
    <div className="fade-in">
      <div className="mb-6">
        <h1 className="text-title font-semibold">Artists</h1>
        {totalArtists > 0 && (
          <p className="text-sm text-text-secondary mt-1">{totalArtists} artists</p>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
        {artists.map(artist => (
          <ArtistCard
            key={artist.Id}
            item={artist}
            onClick={() => navigate(`/artist/${artist.Id}`)}
            subtitle={(artist.AlbumCount || artist.SongCount) ? (artist.AlbumCount ? `${artist.AlbumCount} albums` : '') : undefined}
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
