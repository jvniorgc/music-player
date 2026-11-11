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
    <div className="space-y-10 fade-in">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Listen Now</h1>
        <button
          onClick={handleRadio}
          disabled={radioLoading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-white text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-black/20"
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
            <h2 className="text-xl font-bold">Recently Added</h2>
            <button
              onClick={() => navigate('/albums?sort=recent')}
              className="text-sm text-accent hover:text-accent-hover transition-colors"
            >
              See All
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
                  <AlbumCard item={item} onClick={() => navigate(`/album/${item.Id}`)} fallback={<span className="text-4xl">🎵</span>} />
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
            <h2 className="text-xl font-bold">Recently Played</h2>
          </div>
          <div className="bg-bg-secondary/40 rounded-xl overflow-hidden">
            {recentlyPlayed.slice(0, 10).map((item, i) => (
              <TrackRow
                key={item.Id}
                className="px-4 py-2.5 rounded-lg"
                onClick={() => playItems(recentlyPlayed, i)}
                leading={
                  <CoverArt
                    src={item.AlbumId ? jellyfin.getImageUrl(item.AlbumId, undefined, 80) : null}
                    className="w-10 h-10 rounded overflow-hidden bg-bg-elevated shrink-0 relative"
                    fallback={<span className="text-lg">🎵</span>}
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
          <Clock size={48} className="mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-text-secondary mb-1">Your library is empty</h3>
          <p className="text-sm">Add songs to your Jellyfin server to get started</p>
        </div>
      )}
    </div>
  )
}
