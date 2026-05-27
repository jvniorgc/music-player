import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/auth'
import { useLibraryStore } from '../../stores/library'
import { useDownloadStore } from '../../stores/download'
import { useToastStore } from '../../stores/toast'
import {
  Home, Disc3, Users, Music, ListMusic, Search, LogOut, Download, RefreshCw, Share2, Globe
} from 'lucide-react'
import { useEffect, useState } from 'react'

const navItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/search', icon: Search, label: 'Search' },
]

const libraryItems = [
  { to: '/albums', icon: Disc3, label: 'Albums' },
  { to: '/artists', icon: Users, label: 'Artists' },
  { to: '/songs', icon: Music, label: 'Songs' },
  { to: '/playlists', icon: ListMusic, label: 'Playlists' },
  { to: '/downloads', icon: Download, label: 'Downloads' },
  { to: '/soulseek', icon: Share2, label: 'Soulseek' },
  { to: '/social', icon: Globe, label: 'Social' },
]

export default function Sidebar() {
  const { logout, auth } = useAuthStore()
  const { playlists, fetchPlaylists, refreshAll, isLoading } = useLibraryStore()
  const { loadDownloads } = useDownloadStore()
  const toast = useToastStore(s => s.show)
  const navigate = useNavigate()
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetchPlaylists()
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await refreshAll()
    await loadDownloads()
    setRefreshing(false)
    toast('Library synced', 'success')
  }

  return (
    <aside className="w-60 h-full bg-bg-secondary/80 backdrop-blur-xl border-r border-border-subtle flex flex-col">
      {/* Drag area for titlebar */}
      <div className="h-13 drag-region shrink-0" />

      {/* Main nav */}
      <nav className="px-3 space-y-0.5">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors no-drag ${
                isActive
                  ? 'bg-white/10 text-text-primary'
                  : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
              }`
            }
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Library section */}
      <div className="mt-6 px-3">
        <div className="flex items-center justify-between px-3 mb-2">
          <h3 className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
            Library
          </h3>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-white/10 transition-colors no-drag disabled:opacity-40"
            title="Sync library"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
        <nav className="space-y-0.5">
          {libraryItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors no-drag ${
                  isActive
                    ? 'bg-white/10 text-text-primary'
                    : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Playlists */}
      {playlists.length > 0 && (
        <div className="mt-6 px-3 flex-1 min-h-0 overflow-y-auto">
          <h3 className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider px-3 mb-2">
            Playlists
          </h3>
          <nav className="space-y-0.5">
            {playlists.map(pl => (
              <NavLink
                key={pl.Id}
                to={`/playlist/${pl.Id}`}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm transition-colors truncate no-drag ${
                    isActive
                      ? 'bg-white/10 text-text-primary'
                      : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                  }`
                }
              >
                <ListMusic size={14} className="shrink-0 opacity-50" />
                <span className="truncate">{pl.Name}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      )}

      {/* User / Logout */}
      <div className="mt-auto p-3 border-t border-border-subtle">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors w-full no-drag"
        >
          <LogOut size={16} />
          <span className="truncate">{auth?.username || 'Log out'}</span>
        </button>
      </div>
    </aside>
  )
}
