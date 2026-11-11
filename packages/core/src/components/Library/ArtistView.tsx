import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { jellyfin, JellyfinItem } from '../../services/jellyfin'
import { isAbortError } from '../../services/http'
import { ImagePlus } from 'lucide-react'
import ArtistMetadataEditor from '../Metadata/ArtistMetadataEditor'
import { AlbumCard } from '../UI/MediaCard'

export default function ArtistView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [artist, setArtist] = useState<JellyfinItem | null>(null)
  const [albums, setAlbums] = useState<JellyfinItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showMetadataEditor, setShowMetadataEditor] = useState(false)

  const loadArtist = (signal?: AbortSignal) => {
    if (!id) return
    setLoading(true)
    Promise.all([jellyfin.getItem(id, signal), jellyfin.getArtistAlbums(id, signal)])
      .then(([item, res]) => {
        if (signal?.aborted) return
        setArtist(item)
        setAlbums(res.Items)
      })
      .catch(err => {
        if (!isAbortError(err) && !signal?.aborted) console.warn('[ArtistView] failed to load artist', id, err)
      })
      .finally(() => { if (!signal?.aborted) setLoading(false) })
  }

  useEffect(() => {
    const controller = new AbortController()
    loadArtist(controller.signal)
    return () => controller.abort()
  }, [id])

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-text-tertiary">Loading...</div>
  }

  const imageUrl = artist?.ImageTags?.Primary
    ? jellyfin.getImageUrl(artist.Id, artist.ImageTags.Primary, 600)
    : null

  const backdropUrl = artist?.BackdropImageTags?.[0]
    ? `${jellyfin.serverUrl}/Items/${artist?.Id}/Images/Backdrop?tag=${artist.BackdropImageTags[0]}&quality=80&ApiKey=${jellyfin.token}`
    : null

  return (
    <div className="fade-in -mx-8 -mt-14">
      {/* Hero section */}
      <div className="relative h-72 overflow-hidden">
        {backdropUrl ? (
          <img src={backdropUrl} className="w-full h-full object-cover" alt="" />
        ) : imageUrl ? (
          <img src={imageUrl} className="w-full h-full object-cover blur-3xl scale-110 opacity-30" alt="" />
        ) : (
          <div className="w-full h-full bg-surface-1" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/50 to-transparent" />

        <div className="absolute bottom-0 left-0 right-0 px-8 pb-6">

          <div className="flex items-end gap-6">
            {imageUrl ? (
              <img src={imageUrl} className="w-32 h-32 rounded-full object-cover border border-white/10" alt="" />
            ) : (
              <button
                onClick={() => setShowMetadataEditor(true)}
                className="w-32 h-32 rounded-full bg-surface-2 border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 hover:border-accent/50 hover:bg-white/5 transition-colors"
                title="Find artist image"
              >
                <ImagePlus size={24} className="text-text-tertiary" />
                <span className="text-[10px] text-text-tertiary">Find image</span>
              </button>
            )}
            <div>
              <p className="text-xs font-medium text-text-tertiary mb-1">Artist</p>
              <h1 className="text-display font-semibold">{artist?.Name}</h1>
              <div className="flex items-center gap-3 mt-1">
                {albums.length > 0 && (
                  <p className="text-sm text-text-secondary">{albums.length} albums</p>
                )}
                <button
                  onClick={() => setShowMetadataEditor(true)}
                  className="text-xs text-accent hover:text-accent-hover transition-colors flex items-center gap-1"
                >
                  <ImagePlus size={12} />
                  {imageUrl ? 'Change image' : 'Find image'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Albums */}
      <div className="px-8 mt-8">
        <h2 className="text-heading font-semibold mb-4">Discography</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
          {albums.map(album => (
            <AlbumCard
              key={album.Id}
              item={album}
              onClick={() => navigate(`/album/${album.Id}`)}
              subtitle={<>{album.ProductionYear || ''}{album.Genres?.[0] ? ` · ${album.Genres[0]}` : ''}</>}
            />
          ))}
        </div>
      </div>
      {/* Artist Metadata Editor */}
      {artist && (
        <ArtistMetadataEditor
          artist={artist}
          open={showMetadataEditor}
          onClose={() => setShowMetadataEditor(false)}
          onApplied={() => loadArtist()}
        />
      )}
    </div>
  )
}
