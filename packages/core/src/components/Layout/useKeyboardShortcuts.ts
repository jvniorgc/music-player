import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { usePlayerStore } from '../../stores/player'
import { useAudioPrefs } from '../../stores/prefs/audio'
import { resolveShortcut, SEEK_STEP, FOCUS_SEARCH_EVENT, type ShortcutAction } from '../../lib/shortcuts'

/** Global player shortcuts (ignored while typing in text fields). */
export function useKeyboardShortcuts() {
  const navigate = useNavigate()
  const location = useLocation()
  const pathRef = useRef(location.pathname)
  pathRef.current = location.pathname
  const lastVolume = useRef(1)

  useEffect(() => {
    const run = (action: ShortcutAction) => {
      const p = usePlayerStore.getState()
      const step = useAudioPrefs.getState().values.volumeStep / 100
      switch (action) {
        case 'togglePlay': p.togglePlay(); break
        case 'next': p.next(); break
        case 'previous': p.previous(); break
        case 'seekForward': p.seek(Math.min(p.currentTime + SEEK_STEP, p.duration || Infinity)); break
        case 'seekBack': p.seek(Math.max(0, p.currentTime - SEEK_STEP)); break
        case 'volumeUp': p.setVolume(Math.min(1, Math.round((p.volume + step) * 100) / 100)); break
        case 'volumeDown': p.setVolume(Math.max(0, Math.round((p.volume - step) * 100) / 100)); break
        case 'mute':
          if (p.volume > 0) { lastVolume.current = p.volume; p.setVolume(0) }
          else p.setVolume(lastVolume.current || 1)
          break
        case 'shuffle': p.toggleShuffle(); break
        case 'repeat': p.toggleRepeat(); break
        case 'search':
          if (p.showFullScreen) p.setShowFullScreen(false)
          if (pathRef.current !== '/search') navigate('/search')
          else window.dispatchEvent(new Event(FOCUS_SEARCH_EVENT))
          break
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      const action = resolveShortcut(e)
      if (!action) return
      e.preventDefault()
      run(action)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate])
}
