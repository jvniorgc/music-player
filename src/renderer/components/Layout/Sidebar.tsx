import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/auth'
import { useLibraryStore } from '../../stores/library'
import {
  Home, Disc3, Users, Music, ListMusic, Search, LogOut, Download
} from 'lucide-react'
import { useEffect } from 'react'

const navItems = [
  { to: '/', icon: Home, label: 'Início' },
  { to: '/search', icon: Search, label: 'Buscar' },
]

const libraryItems = [
  { to: '/albums', icon: Disc3, label: 'Álbuns' },
  { to: '/artists', icon: Users, label: 'Artistas' },
  { to: '/songs', icon: Music, label: 'Músicas' },
  { to: '/playlists', icon: ListMusic, label: 'Playlists' },
  { to: '/downloads', icon: Download, label: 'Downloads' },
]

export default function Sidebar() {
  const { logout, auth } = useAuthStore()
  const { playlists, fetchPlaylists } = useLibraryStore()
  const navigate = useNavigate()

  useEffect(() => {
    fetchPlaylists()
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/')
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
        <h3 className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider px-3 mb-2">
          Biblioteca
        </h3>
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
          <span className="truncate">{auth?.username || 'Sair'}</span>
        </button>
      </div>
    </aside>
  )
}
