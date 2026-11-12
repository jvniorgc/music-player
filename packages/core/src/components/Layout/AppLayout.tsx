import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import HistoryNav from './HistoryNav'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import NowPlayingBar from './NowPlayingBar'
import QueueView from '../Player/QueueView'
import FullScreenPlayer from '../Player/FullScreenPlayer'
import ToastContainer from '../UI/ToastContainer'
import { usePlayerStore } from '../../stores/player'
import { useEffect } from 'react'
import { playback } from '../../services/playback'
import { jellyfin } from '../../services/jellyfin'
import { startSessionPersistence } from '../../lib/session'
import { useSystemPrefs } from '../../stores/prefs/system'
import { initTrayIntegration } from '../../services/tray'
import { useShallow } from 'zustand/react/shallow'
import { initGlobalShortcuts } from '../../services/globalShortcuts'
import { initNotifications } from '../../services/notifications'

export default function AppLayout() {
  const { showFullScreen, showQueue, initListeners } = usePlayerStore(useShallow(s => ({ showFullScreen: s.showFullScreen, showQueue: s.showQueue, initListeners: s.initListeners })))

  useKeyboardShortcuts()

  useEffect(() => {
    const cleanup = initListeners()
    // Resume the last session (if enabled) once the store mirrors the engine.
    const { resumeSession, resumeAutoplay } = useSystemPrefs.getState().values
    const stopPersistence = startSessionPersistence(playback, { serverUrl: jellyfin.serverUrl, userId: jellyfin.userId }, { restore: resumeSession, autoplay: resumeAutoplay })
    const stopTray = initTrayIntegration({ playPause: () => playback.togglePlay(), next: () => playback.next(), previous: () => playback.previous() })
    const stopGlobalShortcuts = initGlobalShortcuts()
    const stopNotifications = initNotifications()
    return () => {
      stopNotifications()
      stopGlobalShortcuts()
      stopTray()
      stopPersistence()
      cleanup()
    }
  }, [])

  return (
    <div className="h-full flex flex-col bg-bg">
      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <NowPlayingBar />
          <main className="flex-1 min-w-0 overflow-y-auto relative">
            <div className="sticky top-0 z-20 h-12 -mb-12 px-8 flex items-center pointer-events-none [&>*]:pointer-events-auto">
              <HistoryNav />
            </div>
            <div className="px-8 pb-8 pt-14">
              <Outlet />
            </div>
          </main>
        </div>
        {showQueue && <QueueView />}
      </div>
      {showFullScreen && <FullScreenPlayer />}
      <ToastContainer />
    </div>
  )
}
