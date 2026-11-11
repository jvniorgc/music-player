import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibraryStore } from '../../stores/library'
import { usePlayerStore } from '../../stores/player'
import { useToastStore } from '../../stores/toast'
import { jellyfin } from '../../services/jellyfin'
import { Clock, Radio, Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { TrackSubtitle } from '../UI/Links'
import TrackMenu from '../UI/TrackMenu'
import TrackRow, { TrackDuration, CoverPlayOverlay } from '../UI/TrackRow'
import CoverArt from '../UI/CoverArt'
import { AlbumCard } from '../UI/MediaCard'
import { buttonClass } from '../UI/Button'
import { useShallow } from 'zustand/react/shallow'
import { useT } from '../../i18n'

function HomeSkeleton() {
  const { t } = useT()
  return (
    <div className="space-y-10" aria-busy="true" aria-label={t('home.loading')}>
      <section>
        <div className="skeleton h-6 w-40 mb-4 rounded-sm" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={i >= 4 ? 'hidden sm:block' : ''}>
              <div className="skeleton aspect-square rounded-md mb-2" />
              <div className="skeleton h-4 w-3/4 rounded-sm mb-1" />
              <div className="skeleton h-3 w-1/2 rounded-sm" />
            </div>
          ))}
        </div>
      </section>
      <section>
        <div className="skeleton h-6 w-40 mb-4 rounded-sm" />
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 py-2">
            <div className="skeleton w-10 h-10 rounded-sm shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-3.5 w-1/3 rounded-sm" />
              <div className="skeleton h-3 w-1/4 rounded-sm" />
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}

export default function HomePage() {
  const { t } = useT()
  const { recentlyAdded, recentlyPlayed, homeStatus, fetchHome } = useLibraryStore(useShallow(s => ({ recentlyAdded: s.recentlyAdded, recentlyPlayed: s.recentlyPlayed, homeStatus: s.homeStatus, fetchHome: s.fetchHome })))
  const hasContent = recentlyAdded.length > 0 || recentlyPlayed.length > 0
  const startRadio = usePlayerStore(s => s.startRadio)
  const playItems = usePlayerStore(s => s.playItems)
  const showToast = useToastStore(s => s.show)
  const [radioLoading, setRadioLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    fetchHome()
  }, [])

  const handleRadio = async () => {
    if (radioLoading) return
    setRadioLoading(true)
    try {
      const count = await startRadio()
      if (count === 0) {
        showToast(t('home.mixEmpty'), 'error')
      }
    } catch {
      showToast(t('home.mixFailed'), 'error')
    } finally {
      setRadioLoading(false)
    }
  }

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-title font-semibold">{t('home.title')}</h1>
        <button
          onClick={handleRadio}
          disabled={radioLoading}
          className={buttonClass('primary')}
          title={t('home.instantMixHint')}
        >
          {radioLoading ? <Loader2 size={16} className="animate-spin" /> : <Radio size={16} />}
          {radioLoading ? t('home.instantMixLoading') : t('home.instantMix')}
        </button>
      </div>

      {!hasContent && (homeStatus === 'idle' || homeStatus === 'loading') && <HomeSkeleton />}

      {!hasContent && homeStatus === 'error' && (
        <div className="flex flex-col items-center justify-center py-24 text-text-tertiary">
          <AlertCircle size={40} strokeWidth={1.5} className="mb-4" />
          <h3 className="text-lg font-medium text-text-secondary mb-1">{t('home.error')}</h3>
          <p className="text-sm">{t('home.errorHint')}</p>
          <button onClick={() => fetchHome()} className={`${buttonClass('secondary')} mt-4`}>
            <RefreshCw size={14} /> {t('home.retry')}
          </button>
        </div>
      )}

      {/* Recently Added Albums */}
      {recentlyAdded.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-heading font-semibold">{t('home.recentlyAdded')}</h2>
            <button
              onClick={() => navigate('/albums?sort=recent')}
              className="text-sm text-accent hover:text-accent-hover transition-colors"
            >
              {t('home.seeAll')}
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
            <h2 className="text-heading font-semibold">{t('home.recentlyPlayed')}</h2>
          </div>
          <div className="-mx-4">
            {recentlyPlayed.slice(0, 10).map((item, i) => (
              <TrackRow
                key={item.Id}
                className="px-4 py-2 rounded-sm"
                onClick={() => playItems(recentlyPlayed, i, { type: 'home', name: t('home.recentlyPlayed') })}
                leading={
                  <CoverArt
                    src={item.AlbumId ? jellyfin.getImageUrl(item.AlbumId, undefined, 80) : null}
                    className="w-10 h-10 rounded-sm overflow-hidden bg-surface-2 shrink-0 relative"
                    kind="track"
                  >
                    <CoverPlayOverlay />
                  </CoverArt>
                }
                title={item.Name}
                subtitle={<TrackSubtitle item={item} />}
              >
                <TrackDuration ticks={item.RunTimeTicks} />
                <TrackMenu track={item} />
              </TrackRow>
            ))}
          </div>
        </section>
      )}

      {homeStatus === 'ready' && !hasContent && (
        <div className="flex flex-col items-center justify-center py-24 text-text-tertiary">
          <Clock size={40} strokeWidth={1.5} className="mb-4" />
          <h3 className="text-lg font-medium text-text-secondary mb-1">{t('home.empty')}</h3>
          <p className="text-sm">{t('home.emptyHint')}</p>
        </div>
      )}
    </div>
  )
}
