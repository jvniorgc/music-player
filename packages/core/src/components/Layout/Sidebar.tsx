import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore, useIsAdmin } from '../../stores/auth'
import { useLibraryStore } from '../../stores/library'
import { useDownloadStore } from '../../stores/download'
import { useToastStore } from '../../stores/toast'
import { Home, Disc3, Users, ListMusic, Search, Settings, Download, RefreshCw, Share2, Globe, Shuffle, User, Music, Heart, Inbox, Mail, Trophy, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { jellyfin } from '../../services/jellyfin'
import { usePlayerStore } from '../../stores/player'
import { ProfileEditModal } from '../UI/ProfileEditModal'
import { useShallow } from 'zustand/react/shallow'
import { useT } from '../../i18n'
import { PrivateSessionToggle } from './PrivateSessionToggle'
import { useInboxStore, startInboxPolling, initInboxAutoListen } from '../../stores/inbox'

const navItems = [
  { to: '/', icon: Home, label: 'nav.home' as const },
  { to: '/search', icon: Search, label: 'nav.search' as const },
]

const libraryItems = [
  { to: '/songs', icon: Music, label: 'nav.songs' as const },
  { to: '/liked', icon: Heart, label: 'nav.liked' as const },
  { to: '/albums', icon: Disc3, label: 'nav.albums' as const },
  { to: '/artists', icon: Users, label: 'nav.artists' as const },
  { to: '/playlists', icon: ListMusic, label: 'nav.playlists' as const },
  { to: '/downloads', icon: Download, label: 'nav.downloads' as const },
]

const communityItems = [
  { to: '/social', icon: Globe, label: 'nav.social' as const },
  { to: '/rankings', icon: Trophy, label: 'nav.rankings' as const },
  { to: '/reviews', icon: Star, label: 'nav.reviews' as const },
]

const getMusicItems = [
  { to: '/requests', icon: Inbox, label: 'nav.requests' as const },
  { to: '/soulseek', icon: Share2, label: 'nav.soulseek' as const, adminOnly: true },
]

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-3 py-2 rounded-sm text-sm font-medium transition-colors no-drag ${
    isActive ? 'bg-white/10 text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
  }`

export default function Sidebar() {
  const { t } = useT()
  const isMac = window.api.platform === 'darwin'
  const { auth, primaryImageTag } = useAuthStore(useShallow(s => ({ auth: s.auth, primaryImageTag: s.primaryImageTag })))
  const { playlists, fetchPlaylists, refreshAll } = useLibraryStore(useShallow(s => ({ playlists: s.playlists, fetchPlaylists: s.fetchPlaylists, refreshAll: s.refreshAll })))
  const loadDownloads = useDownloadStore(s => s.loadDownloads)
  const shuffleAllSongs = usePlayerStore(s => s.shuffleAllSongs)
  const toast = useToastStore(s => s.show)
  const navigate = useNavigate()
  const isAdmin = useIsAdmin()
  const [refreshing, setRefreshing] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const { inboxConfigured, inboxUnread } = useInboxStore(useShallow(s => ({ inboxConfigured: s.configured, inboxUnread: s.unread })))

  useEffect(() => {
    fetchPlaylists()
  }, [])

  useEffect(() => {
    const stopPolling = startInboxPolling()
    const stopAutoListen = initInboxAutoListen()
    return () => { stopPolling(); stopAutoListen() }
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    await refreshAll()
    await loadDownloads()
    setRefreshing(false)
    toast(t('nav.librarySynced'), 'success')
  }

  const handleShuffleAll = async () => {
    try {
      await shuffleAllSongs()
    } catch {
      toast(t('nav.shuffleFailed'), 'error')
    }
  }

  const avatarUrl = auth?.userId && primaryImageTag
    ? jellyfin.getUserImageUrl(auth.userId, primaryImageTag, 80)
    : null

  return (
    <aside className="w-60 h-full bg-surface-1 border-r border-border flex flex-col">
      {/* Área de arraste do titlebar — no macOS alinha com a altura da playback bar
          para os botões da janela ficarem integrados na mesma faixa do topo */}
      <div className={`${isMac ? 'h-14' : 'h-13'} drag-region shrink-0`} />

      <div className="flex-1 min-h-0 overflow-y-auto" data-testid="sidebar-scroll">
      {/* Main nav */}
      <nav className="px-3 space-y-0.5">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-sm text-sm font-medium transition-colors no-drag ${
                isActive
                  ? 'bg-white/10 text-text-primary'
                  : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
              }`
            }
          >
            <item.icon size={18} />
            {t(item.label)}
          </NavLink>
        ))}
      </nav>

      {/* Shuffle everything on the server */}
      <div className="px-3 mt-1">
        <button
          onClick={handleShuffleAll}
          className="flex items-center gap-3 px-3 py-2 rounded-sm text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors w-full no-drag"
          title={t('nav.shuffleAllHint')}
        >
          <Shuffle size={18} />
          {t('nav.shuffleAll')}
        </button>
      </div>

      {/* Library section */}
      <div className="mt-6 px-3">
        <div className="flex items-center justify-between px-3 mb-2">
          <h3 className="text-xs font-medium text-text-tertiary">
            {t('nav.library')}
          </h3>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-1 rounded-sm text-text-tertiary hover:text-text-primary hover:bg-white/10 transition-colors no-drag disabled:opacity-40"
            title={t('nav.syncLibrary')}
            aria-label={t('nav.syncLibrary')}
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
                `flex items-center gap-3 px-3 py-2 rounded-sm text-sm font-medium transition-colors no-drag ${
                  isActive
                    ? 'bg-white/10 text-text-primary'
                    : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                }`
              }
            >
              <item.icon size={18} />
              {t(item.label)}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="mt-6 px-3">
        <h3 className="text-xs font-medium text-text-tertiary px-3 mb-2">
          {t('nav.community')}
        </h3>
        <nav className="space-y-0.5">
          {communityItems.map(item => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              <item.icon size={18} />
              {t(item.label)}
            </NavLink>
          ))}
          {inboxConfigured && (
            <NavLink
              to="/inbox"
              className={linkClass}
            >
              <Mail size={18} />
              <span className="flex-1">{t('inbox.nav')}</span>
              {inboxUnread > 0 && (
                <span
                  className="min-w-5 h-5 px-1.5 rounded-full bg-accent text-white text-[11px] font-semibold flex items-center justify-center"
                  aria-label={t('inbox.unreadBadge', { count: inboxUnread })}
                >
                  {inboxUnread > 99 ? '99+' : inboxUnread}
                </span>
              )}
            </NavLink>
          )}
        </nav>
      </div>

      <div className="mt-6 px-3">
        <h3 className="text-xs font-medium text-text-tertiary px-3 mb-2">
          {t('nav.getMusic')}
        </h3>
        <nav className="space-y-0.5">
          {getMusicItems.filter(item => isAdmin || !('adminOnly' in item)).map(item => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              <item.icon size={18} />
              {t(item.label)}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Playlists */}
      {playlists.length > 0 && (
        <div className="mt-6 px-3 pb-3">
          <h3 className="text-xs font-medium text-text-tertiary px-3 mb-2">
            {t('nav.playlists')}
          </h3>
          <nav className="space-y-0.5">
            {playlists.map(pl => (
              <NavLink
                key={pl.Id}
                to={`/playlist/${pl.Id}`}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-1.5 rounded-sm text-sm transition-colors truncate no-drag ${
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

      </div>

      {/* User section */}
      <div className="shrink-0 p-3 border-t border-border space-y-1">
        <PrivateSessionToggle />
        <button
          onClick={() => setProfileOpen(true)}
          className="flex items-center gap-3 px-3 py-2 rounded-sm text-sm text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors w-full no-drag"
          title={t('nav.editProfile')}
        >
          <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 bg-surface-2 flex items-center justify-center">
            {avatarUrl ? (
              <img src={avatarUrl} className="w-full h-full object-cover" alt="" />
            ) : (
              <User size={14} className="text-text-tertiary" />
            )}
          </div>
          <span className="truncate">{auth?.username || t('nav.profile')}</span>
        </button>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-sm text-sm transition-colors w-full no-drag ${
              isActive ? 'bg-white/10 text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
            }`
          }
        >
          <Settings size={16} />
          <span>{t('nav.settings')}</span>
        </NavLink>
      </div>

      <ProfileEditModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </aside>
  )
}
