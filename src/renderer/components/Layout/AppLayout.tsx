import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import NowPlayingBar from './NowPlayingBar'
import QueueView from '../Player/QueueView'
import FullScreenPlayer from '../Player/FullScreenPlayer'
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
        <main className="flex-1 min-w-0 overflow-y-auto relative">
          {/* Top drag region */}
          <div className="h-13 drag-region sticky top-0 z-10 bg-bg-primary/80 backdrop-blur-xl" />
          <div className="px-8 pb-8 pt-2">
            <Outlet />
          </div>
        </main>
        {showQueue && <QueueView />}
      </div>
      <NowPlayingBar />
      {showFullScreen && <FullScreenPlayer />}
    </div>
  )
}
