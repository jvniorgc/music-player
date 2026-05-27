import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { jellyfin, JellyfinItem, JellyfinUser } from '../../services/jellyfin'
import { usePlayerStore } from '../../stores/player'
import { ArrowLeft, ListMusic, Loader2 } from 'lucide-react'

type ViewMode = 'artists' | 'albums' | 'songs'
type TimePeriod = '7d' | '30d' | '3m' | '1y' | 'all'
type GridSize = '4x2' | '5x3'

const TIME_LABELS: Record<TimePeriod, string> = {
  '7d': '7 dias',
  '30d': '30 dias',
  '3m': '3 meses',
  '1y': '1 ano',
  'all': 'All-time',
}

const GRID_COLS: Record<GridSize, number> = { '4x2': 4, '5x3': 5 }
const GRID_COUNT: Record<GridSize, number> = { '4x2': 8, '5x3': 15 }

function getMinDate(period: TimePeriod): string | undefined {
  if (period === 'all') return undefined
  const now = new Date()
  switch (period) {
    case '7d':
      now.setDate(now.getDate() - 7)
      break
    case '30d':
      now.setDate(now.getDate() - 30)
      break
    case '3m':
      now.setMonth(now.getMonth() - 3)
      break
    case '1y':
      now.setFullYear(now.getFullYear() - 1)
      break
  }
  return now.toISOString()
}

export default function UserProfileView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [user, setUser] = useState<JellyfinUser | null>(null)
  const [playlists, setPlaylists] = useState<JellyfinItem[]>([])
  const [topItems, setTopItems] = useState<(JellyfinItem & { periodPlayCount?: number })[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('artists')
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('7d')
  const [gridSize, setGridSize] = useState<GridSize>('4x2')
  const [loading, setLoading] = useState(true)
  const [topLoading, setTopLoading] = useState(false)

  useEffect(() => {
    if (!id) return
    const load = async () => {
      try {
        const users = await jellyfin.getUsers()
        const found = users.find(u => u.Id === id)
        if (found) setUser(found)

        const playlistsRes = await jellyfin.getUserPlaylists(id)
        setPlaylists(playlistsRes.Items)
      } catch (err) {
        console.error('Failed to load user profile:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  useEffect(() => {
    if (!id) return
    const loadTop = async () => {
      setTopLoading(true)
      try {
        const minDate = getMinDate(timePeriod)
        const count = GRID_COUNT[gridSize]
        let items: (JellyfinItem & { periodPlayCount?: number })[]
        if (viewMode === 'artists') {
          items = await jellyfin.getUserTopArtists(id, count, minDate)
        } else if (viewMode === 'albums') {
          items = await jellyfin.getUserTopAlbums(id, count, minDate)
        } else {
          items = await jellyfin.getUserTopSongs(id, count, minDate)
        }
        setTopItems(items)
      } catch (err) {
        console.error('Failed to load top items:', err)
        setTopItems([])
      } finally {
        setTopLoading(false)
      }
    }
    loadTop()
  }, [id, viewMode, timePeriod, gridSize])

  if (loading) {
    return (
      <div className="py-16 flex justify-center fade-in">
        <Loader2 size={24} className="animate-spin text-text-tertiary" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="fade-in text-center py-24 text-text-tertiary">
        <p>Usuário não encontrado</p>
      </div>
    )
  }

  const imageUrl = user.PrimaryImageTag
    ? jellyfin.getUserImageUrl(user.Id, user.PrimaryImageTag, 300)
    : null

  const cols = GRID_COLS[gridSize]

  return (
    <div className="fade-in space-y-8">
      {/* Header */}
      <div className="flex items-center gap-6">
        <button
          onClick={() => navigate('/social')}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="w-20 h-20 rounded-full overflow-hidden bg-bg-elevated shadow-lg shadow-black/30 shrink-0">
          {imageUrl ? (
            <img src={imageUrl} className="w-full h-full object-cover" alt="" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-bg-elevated to-bg-tertiary">
              <span className="text-3xl">👤</span>
            </div>
          )}
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{user.Name}</h1>
          <p className="text-sm text-text-secondary mt-1">Perfil do usuário</p>
        </div>
      </div>

      {/* Playlists */}
      {playlists.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-4">Playlists</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
            {playlists.map(pl => (
              <PlaylistCard key={pl.Id} item={pl} onClick={() => navigate(`/playlist/${pl.Id}`)} />
            ))}
          </div>
        </section>
      )}

      {/* Top Chart Section */}
      <section>
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <h2 className="text-xl font-bold">Top</h2>
          <div className="flex items-center gap-2">
            <select
              value={viewMode}
              onChange={e => setViewMode(e.target.value as ViewMode)}
              className="bg-bg-elevated border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
            >
              <option value="artists">Artistas</option>
              <option value="albums">Álbuns</option>
              <option value="songs">Músicas</option>
            </select>
            <select
              value={timePeriod}
              onChange={e => setTimePeriod(e.target.value as TimePeriod)}
              className="bg-bg-elevated border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
            >
              {(Object.keys(TIME_LABELS) as TimePeriod[]).map(key => (
                <option key={key} value={key}>{TIME_LABELS[key]}</option>
              ))}
            </select>
            <select
              value={gridSize}
              onChange={e => setGridSize(e.target.value as GridSize)}
              className="bg-bg-elevated border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
            >
              <option value="4x2">4×2</option>
              <option value="5x3">5×3</option>
            </select>
          </div>
        </div>

        {topLoading ? (
          <div className="py-12 flex justify-center">
            <Loader2 size={24} className="animate-spin text-text-tertiary" />
          </div>
        ) : topItems.length === 0 ? (
          <div className="py-12 text-center text-text-tertiary text-sm">
            Nenhum dado para este período
          </div>
        ) : (
          <div
            className="grid gap-0.5 max-w-[600px] mx-auto"
            style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
          >
            {topItems.slice(0, GRID_COUNT[gridSize]).map((item, index) => (
              <ChartCell
                key={item.Id}
                item={item}
                rank={index + 1}
                viewMode={viewMode}
                onClick={() => {
                  if (viewMode === 'artists') navigate(`/artist/${item.Id}`)
                  else if (viewMode === 'albums') navigate(`/album/${item.Id}`)
                  else usePlayerStore.getState().playItems([item])
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function ChartCell({ item, rank, viewMode, onClick }: {
  item: JellyfinItem & { periodPlayCount?: number }
  rank: number
  viewMode: ViewMode
  onClick: () => void
}) {
  const plays = item.periodPlayCount ?? item.UserData?.PlayCount

  let imageUrl: string | null = null
  if (viewMode === 'songs') {
    imageUrl = item.AlbumId ? jellyfin.getImageUrl(item.AlbumId, undefined, 300) : null
  } else {
    imageUrl = item.ImageTags?.Primary
      ? jellyfin.getImageUrl(item.Id, item.ImageTags.Primary, 300)
      : null
  }

  const subtitle = viewMode === 'artists'
    ? (plays != null ? `${plays} plays` : '')
    : viewMode === 'albums'
      ? (item.AlbumArtist || '')
      : (item.Artists?.join(', ') || item.AlbumArtist || '')

  return (
    <div className="group relative aspect-square cursor-pointer overflow-hidden bg-bg-elevated" onClick={onClick}>
      {imageUrl ? (
        <img src={imageUrl} className="w-full h-full object-cover" alt="" loading="lazy" />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-bg-elevated to-bg-tertiary">
          <span className="text-3xl opacity-40">
            {viewMode === 'artists' ? '🎤' : viewMode === 'albums' ? '💿' : '🎵'}
          </span>
        </div>
      )}
      {/* Gradient overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />
      {/* Rank badge */}
      <div className="absolute top-1.5 left-1.5 min-w-5 h-5 px-1 rounded bg-black/70 flex items-center justify-center">
        <span className="text-[10px] font-bold text-white leading-none">{rank}</span>
      </div>
      {/* Play count badge */}
      {plays != null && viewMode !== 'artists' && (
        <div className="absolute top-1.5 right-1.5 px-1.5 h-5 rounded bg-black/70 flex items-center justify-center">
          <span className="text-[10px] text-white/90 leading-none">{plays} ▶</span>
        </div>
      )}
      {/* Bottom text overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-2">
        <p className="text-xs font-semibold text-white truncate leading-tight">{item.Name}</p>
        {subtitle && (
          <p className="text-[10px] text-white/70 truncate leading-tight mt-0.5">{subtitle}</p>
        )}
      </div>
    </div>
  )
}

function PlaylistCard({ item, onClick }: { item: JellyfinItem; onClick: () => void }) {
  const imageUrl = item.ImageTags?.Primary
    ? jellyfin.getImageUrl(item.Id, item.ImageTags.Primary)
    : null

  return (
    <div className="group cursor-pointer" onClick={onClick}>
      <div className="relative aspect-square rounded-xl overflow-hidden bg-bg-elevated mb-3 shadow-lg shadow-black/20">
        {imageUrl ? (
          <img src={imageUrl} className="w-full h-full object-cover" alt="" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-bg-elevated to-bg-tertiary">
            <ListMusic size={32} className="text-text-tertiary" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
      </div>
      <p className="text-sm font-medium truncate">{item.Name}</p>
      {item.ChildCount != null && (
        <p className="text-xs text-text-secondary">{item.ChildCount} faixas</p>
      )}
    </div>
  )
}
