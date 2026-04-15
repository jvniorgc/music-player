import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { jellyfin, JellyfinItem } from '../../services/jellyfin'
import { usePlayerStore } from '../../stores/player'
import { Play, Shuffle, ArrowLeft } from 'lucide-react'

export default function ArtistView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [artist, setArtist] = useState<JellyfinItem | null>(null)
  const [albums, setAlbums] = useState<JellyfinItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)

    Promise.all([
      fetch(`${jellyfin.serverUrl}/Users/${jellyfin.userId}/Items/${id}`, {
        headers: { 'X-Emby-Authorization': `MediaBrowser Token="${jellyfin.token}"` }
      }).then(r => r.json()).then(setArtist),
      jellyfin.getArtistAlbums(id).then(r => setAlbums(r.Items))
    ]).finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-text-tertiary">Carregando...</div>
  }

  const imageUrl = artist?.ImageTags?.Primary
    ? jellyfin.getImageUrl(artist.Id, artist.ImageTags.Primary, 600)
    : null

  const backdropUrl = artist?.BackdropImageTags?.[0]
    ? `${jellyfin.serverUrl}/Items/${artist?.Id}/Images/Backdrop?tag=${artist.BackdropImageTags[0]}&quality=80&api_key=${jellyfin.token}`
    : null

  return (
    <div className="fade-in -mx-8 -mt-12">
      {/* Hero section */}
      <div className="relative h-72 overflow-hidden">
        {backdropUrl ? (
          <img src={backdropUrl} className="w-full h-full object-cover" alt="" />
        ) : imageUrl ? (
          <img src={imageUrl} className="w-full h-full object-cover blur-2xl scale-110 opacity-40" alt="" />
        ) : (
          <div className="w-full h-full bg-gradient-to-b from-bg-tertiary to-bg-primary" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-bg-primary via-bg-primary/50 to-transparent" />

        <div className="absolute bottom-0 left-0 right-0 px-8 pb-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-accent hover:text-accent-hover text-sm mb-4 transition-colors"
          >
            <ArrowLeft size={16} />
            Voltar
          </button>

          <div className="flex items-end gap-6">
            {imageUrl && (
              <img src={imageUrl} className="w-32 h-32 rounded-full object-cover shadow-2xl border-2 border-white/10" alt="" />
            )}
            <div>
              <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-1">Artista</p>
              <h1 className="text-4xl font-bold">{artist?.Name}</h1>
              {albums.length > 0 && (
                <p className="text-sm text-text-secondary mt-1">{albums.length} álbuns</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Albums */}
      <div className="px-8 mt-8">
        <h2 className="text-xl font-bold mb-4">Discografia</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
          {albums.map(album => {
            const albumImage = jellyfin.getImageUrl(album.Id, album.ImageTags?.Primary)
            return (
              <div
                key={album.Id}
                className="group cursor-pointer"
                onClick={() => navigate(`/album/${album.Id}`)}
              >
                <div className="relative aspect-square rounded-xl overflow-hidden bg-bg-elevated mb-3 shadow-lg shadow-black/20">
                  {album.ImageTags?.Primary ? (
                    <img src={albumImage} className="w-full h-full object-cover" alt="" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-bg-elevated to-bg-tertiary">
                      <span className="text-4xl">💿</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      jellyfin.getAlbumItems(album.Id).then(r => {
                        if (r.Items.length > 0) usePlayerStore.getState().playItems(r.Items)
                      })
                    }}
                    className="absolute bottom-3 right-3 w-10 h-10 bg-accent rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 transform translate-y-1 group-hover:translate-y-0 shadow-lg"
                  >
                    <Play size={18} className="text-white ml-0.5" fill="white" />
                  </button>
                </div>
                <p className="text-sm font-medium truncate">{album.Name}</p>
                <p className="text-xs text-text-secondary">
                  {album.ProductionYear || ''}{album.Genres?.[0] ? ` · ${album.Genres[0]}` : ''}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
