import { useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import './app.css'
import { useAuthStore } from './stores/auth'
import { useDownloadStore } from './stores/download'
import LoginScreen from './components/Auth/LoginScreen'
import AppLayout from './components/Layout/AppLayout'
import HomePage from './components/Home/HomePage'
import SongList from './components/Library/SongList'
import AlbumGrid from './components/Library/AlbumGrid'
import AlbumView from './components/Library/AlbumView'
import ArtistGrid from './components/Library/ArtistGrid'
import ArtistView from './components/Library/ArtistView'
import PlaylistList from './components/Library/PlaylistList'
import PlaylistView from './components/Library/PlaylistView'
import SearchView from './components/Search/SearchView'
import DownloadsView from './components/Library/DownloadsView'
import SoulseekView from './components/Soulseek/SoulseekView'
import SocialView from './components/Social/SocialView'
import UserProfileView from './components/Social/UserProfileView'
import UpdateDialog from './components/UpdateDialog'
import { Loader2 } from 'lucide-react'
import AppIcon from './components/UI/AppIcon'
import { playback } from './services/playback'
import { useShallow } from 'zustand/react/shallow'

export default function App() {
  const { isAuthenticated, isLoading, restoreSession } = useAuthStore(useShallow(s => ({ isAuthenticated: s.isAuthenticated, isLoading: s.isLoading, restoreSession: s.restoreSession })))
  const { loadDownloads, initListeners } = useDownloadStore(useShallow(s => ({ loadDownloads: s.loadDownloads, initListeners: s.initListeners })))

  useEffect(() => {
    restoreSession()
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      loadDownloads()
      const cleanup = initListeners()
      return cleanup
    }
  }, [isAuthenticated])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.code === 'Space') {
        e.preventDefault()
        playback.togglePlay()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-bg gap-4">
        <AppIcon size={64} />
        <Loader2 size={24} className="animate-spin text-text-tertiary" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginScreen />
  }

  return (
    <HashRouter>
      <UpdateDialog />
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchView />} />
          <Route path="/songs" element={<SongList />} />
          <Route path="/albums" element={<AlbumGrid />} />
          <Route path="/album/:id" element={<AlbumView />} />
          <Route path="/artists" element={<ArtistGrid />} />
          <Route path="/artist/:id" element={<ArtistView />} />
          <Route path="/playlists" element={<PlaylistList />} />
          <Route path="/playlist/:id" element={<PlaylistView />} />
          <Route path="/downloads" element={<DownloadsView />} />
          <Route path="/soulseek" element={<SoulseekView />} />
          <Route path="/social" element={<SocialView />} />
          <Route path="/social/user/:id" element={<UserProfileView />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
