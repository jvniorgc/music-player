import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { jellyfin, JellyfinItem } from '../../services/jellyfin'
import { isAbortError } from '../../services/http'
import { ImagePlus, Play, Shuffle, Send } from 'lucide-react'
import { usePlayerStore } from '../../stores/player'
import type { PlaybackContext } from '../../services/playback'
import { useHeaderStats, PopularitySummary } from '../UI/Popularity'
import { getArtistStats, artistKey } from '../../services/popularity'
import TrackRow, { TrackIndex, TrackDuration } from '../UI/TrackRow'
import CoverArt from '../UI/CoverArt'
import TrackMenu from '../UI/TrackMenu'
import LikeButton from '../UI/LikeButton'
import { AlbumLink } from '../UI/Links'
import { buttonClass } from '../UI/Button'
import ArtistMetadataEditor from '../Metadata/ArtistMetadataEditor'
import { AlbumCard } from '../UI/MediaCard'
import { useT } from '../../i18n'
import { isConfigured } from '../../services/social'
import { itemFromJellyfin, type RecItem } from '../../services/friendRecs'
import { useIsAdmin } from '../../stores/auth'
import RecommendModal from '../Inbox/RecommendModal'

export default function ArtistView() {
  const { t, tn } = useT()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [artist, setArtist] = useState<JellyfinItem | null>(null)
  const [albums, setAlbums] = useState<JellyfinItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showMetadataEditor, setShowMetadataEditor] = useState(false)
  const isAdmin = useIsAdmin()
  const [recItem, setRecItem] = useState<RecItem | null>(null)
  const [topSongs, setTopSongs] = useState<JellyfinItem[]>([])
  const playItems = usePlayerStore(s => s.playItems)
  const playFromList = usePlayerStore(s => s.playFromList)
  const shuffleItems = usePlayerStore(s => s.shuffleItems)
  const currentId = usePlayerStore(s => s.currentTrack?.id)
  const isPlaying = usePlayerStore(s => s.isPlaying)
  const artistStats = useHeaderStats(artist?.Name ? artistKey(artist.Name) : null, () => getArtistStats(artist!.Name))

  const loadArtist = (signal?: AbortSignal) => {
    if (!id) return
    setLoading(true)
    Promise.all([jellyfin.getItem(id, signal), jellyfin.getArtistAlbums(id, signal)])
      .then(([item, res]) => {
        if (signal?.aborted) return
        setArtist(item)
        setAlbums(res.Items)
      })
      .then(() => jellyfin.getArtistTopSongs(id, 10, signal))
      .then(songs => { if (!signal?.aborted && songs) setTopSongs(songs) })
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
    return <div className="flex items-center justify-center py-24 text-text-tertiary">{t('common.loading')}</div>
  }

  const imageUrl = artist?.ImageTags?.Primary
    ? jellyfin.getImageUrl(artist.Id, artist.ImageTags.Primary, 600)
    : null

  const backdropUrl = artist?.BackdropImageTags?.[0]
    ? `${jellyfin.serverUrl}/Items/${artist?.Id}/Images/Backdrop?tag=${artist.BackdropImageTags[0]}&quality=80&ApiKey=${jellyfin.token}`
    : null

  const artistContext: PlaybackContext = { type: 'artist', id: id || '', name: artist?.Name || t('artist.label') }

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
            ) : !isAdmin ? (
              <div className="w-32 h-32 rounded-full bg-surface-2 border border-border" />
            ) : (
              <button
                onClick={() => setShowMetadataEditor(true)}
                className="w-32 h-32 rounded-full bg-surface-2 border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 hover:border-accent/50 hover:bg-white/5 transition-colors"
                title={t('artist.findImageTitle')}
                aria-label={t('artist.findImageTitle')}
              >
                <ImagePlus size={24} className="text-text-tertiary" />
                <span className="text-[10px] text-text-tertiary">{t('artist.findImage')}</span>
              </button>
            )}
            <div>
              <p className="text-xs font-medium text-text-tertiary mb-1">{t('artist.label')}</p>
              <h1 className="text-display font-semibold">{artist?.Name}</h1>
              <div className="flex items-center gap-3 mt-1">
                {albums.length > 0 && (
                  <p className="text-sm text-text-secondary">{tn('common.albumCount', albums.length)}</p>
                )}
                {isAdmin && (
                  <button
                    onClick={() => setShowMetadataEditor(true)}
                    className="text-xs text-accent hover:text-accent-hover transition-colors flex items-center gap-1"
                  >
                    <ImagePlus size={12} />
                    {imageUrl ? t('artist.changeImage') : t('artist.findImage')}
                  </button>
                )}
                {artist && isConfigured() && (
                  <button
                    onClick={() => setRecItem(itemFromJellyfin(artist))}
                    className="text-xs text-accent hover:text-accent-hover transition-colors flex items-center gap-1"
                  >
                    <Send size={12} />
                    {t('inbox.recommend')}
                  </button>
                )}
              </div>
              <PopularitySummary stats={artistStats} />
              {topSongs.length > 0 && (
                <div className="flex items-center gap-3 mt-4">
                  <button onClick={() => playItems(topSongs, 0, artistContext)} className={buttonClass('primary')}>
                    <Play size={16} fill="white" className="ml-0.5" />
                    {t('common.play')}
                  </button>
                  <button onClick={() => shuffleItems(topSongs, artistContext)} className={buttonClass('secondary')}>
                    <Shuffle size={15} />
                    {t('common.shuffle')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {topSongs.length > 0 && (
        <div className="px-8 mt-8">
          <h2 className="text-heading font-semibold mb-4">{t('artist.popular')}</h2>
          <div className="-mx-4">
            {topSongs.slice(0, 5).map((song, i) => {
              const isCurrent = currentId === song.Id
              return (
                <TrackRow
                  key={song.Id}
                  isCurrent={isCurrent}
                  onClick={() => playFromList(topSongs, i, artistContext)}
                  leading={
                    <>
                      <TrackIndex number={i + 1} isCurrent={isCurrent} isPlaying={isPlaying} className="w-6" />
                      <CoverArt
                        src={song.AlbumId ? jellyfin.getImageUrl(song.AlbumId, undefined, 80) : null}
                        className="w-10 h-10 rounded-sm overflow-hidden bg-surface-2 shrink-0"
                        kind="track"
                      />
                    </>
                  }
                  title={song.Name}
                  subtitle={<AlbumLink item={song} />}
                >
                  <LikeButton item={song} revealOnHover />
                  <TrackDuration ticks={song.RunTimeTicks} />
                  <TrackMenu track={song} />
                </TrackRow>
              )
            })}
          </div>
        </div>
      )}

      {/* Albums */}
      <div className="px-8 mt-8">
        <h2 className="text-heading font-semibold mb-4">{t('artist.discography')}</h2>
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
      {artist && isAdmin && (
        <ArtistMetadataEditor
          artist={artist}
          open={showMetadataEditor}
          onClose={() => setShowMetadataEditor(false)}
          onApplied={() => loadArtist()}
        />
      )}
      <RecommendModal item={recItem} onClose={() => setRecItem(null)} />
    </div>
  )
}
