import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import HistoryNav from './HistoryNav'
import NowPlayingBar from './NowPlayingBar'
import QueueView from '../Player/QueueView'
import FullScreenPlayer from '../Player/FullScreenPlayer'
import ToastContainer from '../UI/ToastContainer'
import { usePlayerStore } from '../../stores/player'
import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'

export default function AppLayout() {
  const { showFullScreen, showQueue, initListeners } = usePlayerStore(useShallow(s => ({ showFullScreen: s.showFullScreen, showQueue: s.showQueue, initListeners: s.initListeners })))

  useEffect(() => {
    const cleanup = initListeners()
    return cleanup
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
