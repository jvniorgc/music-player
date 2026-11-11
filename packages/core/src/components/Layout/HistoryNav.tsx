import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { isEditableTarget } from '../../lib/shortcuts'

/** react-router stores the history position in `history.state.idx`. */
function currentIdx(): number {
  const idx = (window.history.state as { idx?: unknown } | null)?.idx
  return typeof idx === 'number' ? idx : 0
}

/** Tracks whether back/forward is possible inside the app's own history. */
export function useHistoryNav() {
  const location = useLocation()
  const navType = useNavigationType()
  const navigate = useNavigate()
  const maxIdx = useRef(currentIdx())
  const [idx, setIdx] = useState(currentIdx())

  useEffect(() => {
    const i = currentIdx()
    // A push truncates the forward stack; POP/REPLACE keep it.
    maxIdx.current = navType === 'PUSH' ? i : Math.max(maxIdx.current, i)
    setIdx(i)
  }, [location.key, navType])

  const canBack = idx > 0
  const canForward = idx < maxIdx.current
  return {
    canBack,
    canForward,
    back: () => { if (currentIdx() > 0) navigate(-1) },
    forward: () => { if (currentIdx() < maxIdx.current) navigate(1) },
  }
}

const BTN = 'w-7 h-7 inline-flex items-center justify-center rounded-full bg-black/30 text-text-primary hover:bg-black/50 disabled:opacity-30 disabled:cursor-default disabled:hover:bg-black/30 transition-colors no-drag'

/** App-wide back/forward buttons; also handles mouse buttons 3/4. */
export default function HistoryNav() {
  const { canBack, canForward, back, forward } = useHistoryNav()
  const backRef = useRef(back)
  const forwardRef = useRef(forward)
  backRef.current = back
  forwardRef.current = forward

  useEffect(() => {
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 3) { e.preventDefault(); backRef.current() }
      else if (e.button === 4) { e.preventDefault(); forwardRef.current() }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || isEditableTarget(e.target)) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); backRef.current() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); forwardRef.current() }
    }
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  return (
    <div className="flex items-center gap-2">
      <button className={BTN} onClick={back} disabled={!canBack} aria-label="Go back" title="Go back">
        <ChevronLeft size={18} />
      </button>
      <button className={BTN} onClick={forward} disabled={!canForward} aria-label="Go forward" title="Go forward">
        <ChevronRight size={18} />
      </button>
    </div>
  )
}
