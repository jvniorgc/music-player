import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import NowPlayingBar from './NowPlayingBar'
import WindowControls from './WindowControls'
import QueueView from '../Player/QueueView'
import FullScreenPlayer from '../Player/FullScreenPlayer'
import ToastContainer from '../UI/ToastContainer'
import { usePlayerStore } from '../../stores/player'
import { useEffect } from 'react'

export default function AppLayout() {
  const { showFullScreen, showQueue, initListeners } = usePlayerStore()

  useEffect(() => {
    const cleanup = initListeners()
    return cleanup
  }, [])

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Window controls - fixed top right */}
      <div className="fixed top-0 right-0 z-50">
        <WindowControls />
      </div>
      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <NowPlayingBar />
          <main className="flex-1 min-w-0 overflow-y-auto relative">
            <div className="px-8 pb-8 pt-4">
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
