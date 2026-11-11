import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibraryStore } from '../../stores/library'
import { usePlayerStore } from '../../stores/player'
import { useToastStore } from '../../stores/toast'
import { jellyfin } from '../../services/jellyfin'
import { Clock, Radio, Loader2 } from 'lucide-react'
import { artistNames } from '../../lib/format'
import TrackRow, { TrackDuration, CoverPlayOverlay } from '../UI/TrackRow'
import CoverArt from '../UI/CoverArt'
import { AlbumCard } from '../UI/MediaCard'
import { buttonClass } from '../UI/Button'
import { useShallow } from 'zustand/react/shallow'

export default function HomePage() {
  const { recentlyAdded, recentlyPlayed, isLoading, fetchHome } = useLibraryStore(useShallow(s => ({ recentlyAdded: s.recentlyAdded, recentlyPlayed: s.recentlyPlayed, isLoading: s.isLoading, fetchHome: s.fetchHome })))
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
        showToast('Não foi possível gerar recomendações. Ouça mais músicas e tente de novo.', 'error')
      }
    } catch {
      showToast('Falha ao iniciar o mix.', 'error')
    } finally {
      setRadioLoading(false)
    }
  }

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-title font-semibold">Listen now</h1>
        <button
          onClick={handleRadio}
          disabled={radioLoading}
          className={buttonClass('primary')}
          title="Toca um mix com base no que você andou ouvindo, com faixas em alta misturadas"
        >
          {radioLoading ? <Loader2 size={16} className="animate-spin" /> : <Radio size={16} />}
          {radioLoading ? 'Gerando…' : 'Tocar Mix'}
        </button>
      </div>

      {/* Recently Added Albums */}
      {recentlyAdded.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-heading font-semibold">Recently added</h2>
            <button
              onClick={() => navigate('/albums?sort=recent')}
              className="text-sm text-accent hover:text-accent-hover transition-colors"
            >
              See all
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
            <h2 className="text-heading font-semibold">Recently played</h2>
          </div>
          <div className="-mx-4">
            {recentlyPlayed.slice(0, 10).map((item, i) => (
              <TrackRow
                key={item.Id}
                className="px-4 py-2 rounded-sm"
                onClick={() => playItems(recentlyPlayed, i)}
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
                subtitle={<>{artistNames(item, 'Unknown')}{item.Album ? ` — ${item.Album}` : ''}</>}
              >
                <TrackDuration ticks={item.RunTimeTicks} />
              </TrackRow>
            ))}
          </div>
        </section>
      )}

      {!isLoading && recentlyAdded.length === 0 && recentlyPlayed.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-text-tertiary">
          <Clock size={40} strokeWidth={1.5} className="mb-4" />
          <h3 className="text-lg font-medium text-text-secondary mb-1">Your library is empty</h3>
          <p className="text-sm">Add songs to your Jellyfin server to get started</p>
        </div>
      )}
    </div>
  )
}
