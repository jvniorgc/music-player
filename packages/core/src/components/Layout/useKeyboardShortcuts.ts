import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { usePlayerStore } from '../../stores/player'
import { useShortcutPrefs } from '../../stores/prefs/shortcuts'
import { runPlayerAction } from '../../services/playerActions'
import { resolveShortcut, effectiveBindings, FOCUS_SEARCH_EVENT } from '../../lib/shortcuts'

/** Global player shortcuts (ignored while typing in text fields). */
export function useKeyboardShortcuts() {
  const navigate = useNavigate()
  const location = useLocation()
  const pathRef = useRef(location.pathname)
  pathRef.current = location.pathname

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      const action = resolveShortcut(e, effectiveBindings(useShortcutPrefs.getState().values))
      if (!action) return
      e.preventDefault()
      if (action !== 'search') return runPlayerAction(action)
      const p = usePlayerStore.getState()
      if (p.showFullScreen) p.setShowFullScreen(false)
      if (pathRef.current !== '/search') navigate('/search')
      else window.dispatchEvent(new Event(FOCUS_SEARCH_EVENT))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate])
}
