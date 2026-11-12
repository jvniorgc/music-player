import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Pause, Headphones } from 'lucide-react'
import { useT } from '../../i18n'
import { isConfigured } from '../../services/social'
import { listNowPlaying, joinPositionSeconds, type FriendNowPlaying } from '../../services/nowPlaying'
import { jellyfin } from '../../services/jellyfin'
import { playback } from '../../services/playback'
import { useInterfacePrefs } from '../../stores/prefs/interface'

const POLL_MS = 15_000

/** Compact sidebar section showing what friends are playing right now (via the social API). */
export function FriendsNowPlaying() {
  const { t } = useT()
  const enabled = useInterfacePrefs(s => s.values.showNowPlaying)
  const [items, setItems] = useState<FriendNowPlaying[]>([])
  const [open, setOpen] = useState(true)
  const fetchedAt = useRef(0)
  const active = enabled && isConfigured()

  const refresh = useCallback(async () => {
    if (document.hidden) return
    try {
      const list = await listNowPlaying()
      fetchedAt.current = Date.now()
      setItems(list)
    } catch {
      setItems([])
    }
  }, [])

  useEffect(() => {
    if (!active) return
    refresh()
    const id = setInterval(refresh, POLL_MS)
    const onVisible = () => { if (!document.hidden) refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [active, refresh])

  const join = async (e: FriendNowPlaying) => {
    const startAt = joinPositionSeconds(e, fetchedAt.current)
    try {
      const item = await jellyfin.getItem(e.item.id)
      playback.setQueue([item], 0, { type: 'custom', name: e.userName }, { startAt })
    } catch (err) {
      console.warn('[now-playing] join failed', err)
    }
  }

  if (!active || items.length === 0) return null

  return (
    <div className="mt-6 px-3">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex items-center gap-1 px-3 mb-2 text-xs font-medium text-text-tertiary hover:text-text-primary no-drag"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {t('nowPlaying.title')}
      </button>
      {open && (
        <ul className="space-y-0.5">
          {items.map(e => {
            const track = e.item.artists.length ? `${e.item.name} — ${e.item.artists.join(', ')}` : e.item.name
            return (
              <li key={`${e.userId}-${e.deviceName}`}>
                <button
                  onClick={() => join(e)}
                  aria-label={t('nowPlaying.join', { name: e.userName })}
                  title={t('nowPlaying.join', { name: e.userName })}
                  className="group flex items-center gap-2 px-3 py-1.5 rounded-sm w-full text-left hover:bg-white/5 transition-colors no-drag"
                >
                  <span className="w-6 h-6 rounded-full shrink-0 bg-surface-2 flex items-center justify-center text-xs text-text-secondary">
                    {e.userName.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-text-primary truncate">{e.userName}</span>
                    <span className="block text-xs text-text-tertiary truncate">{track}</span>
                  </span>
                  {e.isPaused
                    ? <Pause size={12} className="shrink-0 text-text-tertiary" aria-label={t('nowPlaying.paused')} />
                    : <Headphones size={12} className="shrink-0 text-accent opacity-0 group-hover:opacity-100" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
