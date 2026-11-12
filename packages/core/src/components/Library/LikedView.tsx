import { useEffect, useState } from 'react'
import { Play, Pause, Shuffle, Heart, Download } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { jellyfin, JellyfinItem } from '../../services/jellyfin'
import { isAbortError } from '../../services/http'
import type { PlaybackContext } from '../../services/playback'
import { usePlayerStore } from '../../stores/player'
import { useDownloadStore } from '../../stores/download'
import { useToastStore } from '../../stores/toast'
import TrackMenu from '../UI/TrackMenu'
import { TrackSubtitle } from '../UI/Links'
import TrackRow, { TrackIndex, TrackDuration } from '../UI/TrackRow'
import CoverArt from '../UI/CoverArt'
import { buttonClass } from '../UI/Button'
import { useT } from '../../i18n'

export default function LikedView() {
  const { t, tn } = useT()
  const [tracks, setTracks] = useState<JellyfinItem[]>([])
  const [loading, setLoading] = useState(true)
  const { playItems, playFromList, shuffleItems, currentTrack, isPlaying, togglePlay } = usePlayerStore(useShallow(s => ({ playItems: s.playItems, playFromList: s.playFromList, shuffleItems: s.shuffleItems, currentTrack: s.currentTrack, isPlaying: s.isPlaying, togglePlay: s.togglePlay })))
  const { isDownloaded, startDownload } = useDownloadStore(useShallow(s => ({ isDownloaded: s.isDownloaded, startDownload: s.startDownload, downloads: s.downloads })))
  const toast = useToastStore(s => s.show)

  useEffect(() => {
    const controller = new AbortController()
    jellyfin.getFavoriteSongs(controller.signal)
      .then(res => {
        if (controller.signal.aborted) return
        setTracks(res.Items)
        void useDownloadStore.getState().autoDownloadLiked(res.Items)
      })
      .catch(err => { if (!isAbortError(err) && !controller.signal.aborted) console.warn('[LikedView] failed to load', err) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  const handleUnlike = async (track: JellyfinItem) => {
    try {
      await jellyfin.toggleFavorite(track.Id, true)
      setTracks(prev => prev.filter(x => x.Id !== track.Id))
    } catch (err) {
      console.error('Failed to unlike track:', err)
      toast(t('liked.unlikeFailed'), 'error')
    }
  }

  const handleDownloadAll = () => {
    tracks.forEach(track => { if (!isDownloaded(track.Id)) startDownload(track) })
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-text-tertiary">{t('common.loading')}</div>
  }

  const context: PlaybackContext = { type: 'liked', name: t('liked.title') }
  const isCurrentList = !!currentTrack && tracks.some(x => x.Id === currentTrack.id)
  const showPause = isCurrentList && isPlaying

  return (
    <div className="fade-in">
      <div className="flex gap-8 mb-8">
        <div className="w-56 h-56 rounded-lg overflow-hidden shadow-lg shrink-0 flex items-center justify-center bg-gradient-to-br from-accent to-surface-2">
          <Heart size={72} className="text-white" fill="currentColor" />
        </div>

        <div className="flex flex-col justify-end min-w-0">
          <p className="text-xs font-medium text-text-tertiary mb-2">{t('playlist.label')}</p>
          <h1 className="text-title font-semibold truncate">{t('liked.title')}</h1>
          <p className="text-sm text-text-secondary mt-2">{tn('common.songCount', tracks.length)}</p>

          {tracks.length > 0 && (
            <div className="flex items-center gap-3 mt-5">
              <button
                onClick={() => { if (showPause) togglePlay(); else playItems(tracks, 0, context) }}
                className={buttonClass('primary')}
              >
                {showPause ? <Pause size={16} fill="white" /> : <Play size={16} fill="white" className="ml-0.5" />}
                {showPause ? t('common.pause') : t('common.play')}
              </button>
              <button onClick={() => shuffleItems(tracks, context)} className={buttonClass('secondary')}>
                <Shuffle size={15} />
                {t('common.shuffle')}
              </button>
              <button onClick={handleDownloadAll} className={buttonClass('secondary')}>
                <Download size={15} />
                {t('liked.downloadAll')}
              </button>
            </div>
          )}
        </div>
      </div>

      {tracks.length > 0 ? (
        <div>
          {tracks.map((track, i) => {
            const isCurrent = currentTrack?.id === track.Id
            return (
              <TrackRow
                key={track.Id}
                isCurrent={isCurrent}
                onClick={() => playFromList(tracks, i, context)}
                leading={
                  <>
                    <TrackIndex number={i + 1} isCurrent={isCurrent} isPlaying={isPlaying} className="w-7" />
                    <CoverArt
                      src={track.AlbumId ? jellyfin.getImageUrl(track.AlbumId, undefined, 80) : null}
                      className="w-10 h-10 rounded overflow-hidden bg-surface-2 shrink-0"
                      kind="track"
                    />
                  </>
                }
                title={track.Name}
                subtitle={<TrackSubtitle item={track} />}
              >
                <button
                  onClick={e => { e.stopPropagation(); handleUnlike(track) }}
                  className="p-1.5 rounded-full text-accent hover:bg-white/10 transition-colors"
                  title={t('liked.unlike')}
                  aria-label={t('liked.unlike')}
                >
                  <Heart size={15} fill="currentColor" />
                </button>
                <TrackDuration ticks={track.RunTimeTicks} />
                <TrackMenu track={track} />
              </TrackRow>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-text-tertiary">
          <Heart size={40} className="mb-3 opacity-50" />
          <p className="text-sm font-medium">{t('liked.empty')}</p>
          <p className="text-xs mt-1">{t('liked.emptyHint')}</p>
        </div>
      )}
    </div>
  )
}
