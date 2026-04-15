import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibraryStore } from '../../stores/library'
import { jellyfin } from '../../services/jellyfin'
import { ListMusic, Music } from 'lucide-react'

export default function PlaylistList() {
  const { playlists, fetchPlaylists } = useLibraryStore()
  const navigate = useNavigate()

  useEffect(() => {
    fetchPlaylists()
  }, [])

  return (
    <div className="fade-in">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Playlists</h1>
        {playlists.length > 0 && (
          <p className="text-sm text-text-secondary mt-1">{playlists.length} playlists</p>
        )}
      </div>

      {playlists.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
          {playlists.map(pl => {
            const imageUrl = pl.ImageTags?.Primary
              ? jellyfin.getImageUrl(pl.Id, pl.ImageTags.Primary)
              : null

            return (
              <div
                key={pl.Id}
                className="group cursor-pointer"
                onClick={() => navigate(`/playlist/${pl.Id}`)}
              >
                <div className="relative aspect-square rounded-xl overflow-hidden bg-bg-elevated mb-3 shadow-lg shadow-black/20">
                  {imageUrl ? (
                    <img src={imageUrl} className="w-full h-full object-cover" alt="" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-accent/20 to-pink-600/20">
                      <ListMusic size={48} className="text-accent/60" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                </div>
                <p className="text-sm font-medium truncate">{pl.Name}</p>
                <p className="text-xs text-text-secondary">
                  {pl.ChildCount ? `${pl.ChildCount} músicas` : 'Playlist'}
                </p>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-text-tertiary">
          <ListMusic size={48} className="mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-text-secondary mb-1">Nenhuma playlist</h3>
          <p className="text-sm">Crie playlists no seu servidor Jellyfin</p>
        </div>
      )}
    </div>
  )
}
