import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { jellyfin, JellyfinItem, JellyfinUser } from '../../services/jellyfin'
import { usePlayerStore } from '../../stores/player'
import { ArrowLeft, ListMusic, Loader2, Play } from 'lucide-react'

type ViewMode = 'artists' | 'albums'
type TimePeriod = '7d' | '30d' | '3m' | '1y'

const TIME_LABELS: Record<TimePeriod, string> = {
  '7d': '7 dias',
  '30d': '30 dias',
  '3m': '3 meses',
  '1y': '1 ano',
}

function getMinDate(period: TimePeriod): string {
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
  const [topItems, setTopItems] = useState<JellyfinItem[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('artists')
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('7d')
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
        const res = viewMode === 'artists'
          ? await jellyfin.getUserTopArtists(id, 20, minDate)
          : await jellyfin.getUserTopAlbums(id, 20, minDate)
        setTopItems(res.Items)
      } catch (err) {
        console.error('Failed to load top items:', err)
        setTopItems([])
      } finally {
        setTopLoading(false)
      }
    }
    loadTop()
  }, [id, viewMode, timePeriod])

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

      {/* Top Section */}
      <section>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-xl font-bold">Top</h2>
          <div className="flex items-center gap-3">
            <select
              value={viewMode}
              onChange={e => setViewMode(e.target.value as ViewMode)}
              className="bg-bg-elevated border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
            >
              <option value="artists">Artistas</option>
              <option value="albums">Álbuns</option>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
            {topItems.map((item, index) => (
              viewMode === 'artists'
                ? <TopArtistCard key={item.Id} item={item} rank={index + 1} onClick={() => navigate(`/artist/${item.Id}`)} />
                : <TopAlbumCard key={item.Id} item={item} rank={index + 1} onClick={() => navigate(`/album/${item.Id}`)} />
            ))}
          </div>
        )}
      </section>
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

function TopArtistCard({ item, rank, onClick }: { item: JellyfinItem; rank: number; onClick: () => void }) {
  const imageUrl = item.ImageTags?.Primary
    ? jellyfin.getImageUrl(item.Id, item.ImageTags.Primary)
    : null

  return (
    <div className="group cursor-pointer text-center" onClick={onClick}>
      <div className="relative aspect-square rounded-full overflow-hidden bg-bg-elevated mb-3 mx-auto shadow-lg shadow-black/20">
        {imageUrl ? (
          <img src={imageUrl} className="w-full h-full object-cover" alt="" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-bg-elevated to-bg-tertiary">
            <span className="text-4xl">🎤</span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-full" />
        <div className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-black/70 flex items-center justify-center">
          <span className="text-xs font-bold text-white">{rank}</span>
        </div>
      </div>
      <p className="text-sm font-medium truncate">{item.Name}</p>
      {item.UserData?.PlayCount != null && (
        <p className="text-xs text-text-secondary">{item.UserData.PlayCount} plays</p>
      )}
    </div>
  )
}

function TopAlbumCard({ item, rank, onClick }: { item: JellyfinItem; rank: number; onClick: () => void }) {
  const imageUrl = item.ImageTags?.Primary
    ? jellyfin.getImageUrl(item.Id, item.ImageTags.Primary)
    : null
  const { playItems } = usePlayerStore()

  const handlePlay = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const res = await jellyfin.getAlbumItems(item.Id)
      if (res.Items.length > 0) playItems(res.Items)
    } catch {}
  }

  return (
    <div className="group cursor-pointer" onClick={onClick}>
      <div className="relative aspect-square rounded-xl overflow-hidden bg-bg-elevated mb-3 shadow-lg shadow-black/20">
        {imageUrl ? (
          <img src={imageUrl} className="w-full h-full object-cover" alt="" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-bg-elevated to-bg-tertiary">
            <span className="text-4xl">💿</span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
        <div className="absolute top-2 left-2 w-6 h-6 rounded-md bg-black/70 flex items-center justify-center">
          <span className="text-xs font-bold text-white">{rank}</span>
        </div>
        <button
          onClick={handlePlay}
          className="absolute bottom-3 right-3 w-10 h-10 bg-accent rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 transform translate-y-1 group-hover:translate-y-0 shadow-lg shadow-black/30"
        >
          <Play size={18} className="text-white ml-0.5" fill="white" />
        </button>
      </div>
      <p className="text-sm font-medium truncate">{item.Name}</p>
      <p className="text-xs text-text-secondary truncate">
        {item.AlbumArtist || ''}
        {item.UserData?.PlayCount != null ? ` · ${item.UserData.PlayCount} plays` : ''}
      </p>
    </div>
  )
}
