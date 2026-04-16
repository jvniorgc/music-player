import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import NowPlayingBar from './NowPlayingBar'
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
      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top drag region */}
          <div className="h-13 drag-region shrink-0 bg-bg-primary/80 backdrop-blur-xl" />
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
