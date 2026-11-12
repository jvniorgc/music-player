import { useCallback, useEffect, useRef, useState } from 'react'
import { Pause, Headphones } from 'lucide-react'
import { useT } from '../../i18n'
import { Marquee } from '../UI/Marquee'
import { listNowPlaying, joinPositionSeconds, type FriendNowPlaying } from '../../services/nowPlaying'
import { jellyfin } from '../../services/jellyfin'
import { playback } from '../../services/playback'
import { useInterfacePrefs } from '../../stores/prefs/interface'

const POLL_MS = 15_000

/** Home page section showing what friends are playing right now (social API, or Jellyfin sessions as a fallback). */
export function FriendsNowPlaying() {
  const { t } = useT()
  const enabled = useInterfacePrefs(s => s.values.showNowPlaying)
  const [items, setItems] = useState<FriendNowPlaying[]>([])
  const fetchedAt = useRef(0)
  const active = enabled

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
    <section>
      <h2 className="text-heading font-semibold mb-4">{t('nowPlaying.title')}</h2>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {items.map(e => {
          const track = e.item.artists.length ? `${e.item.name} — ${e.item.artists.join(', ')}` : e.item.name
          return (
            <li key={`${e.userId}-${e.deviceName}`}>
              <button
                onClick={() => join(e)}
                aria-label={t('nowPlaying.join', { name: e.userName })}
                title={t('nowPlaying.join', { name: e.userName })}
                className="group flex items-center gap-3 p-3 rounded-md w-full text-left bg-surface-1 hover:bg-white/5 transition-colors"
              >
                <span className="w-10 h-10 rounded-full shrink-0 bg-surface-2 flex items-center justify-center text-sm text-text-secondary">
                  {e.userName.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-text-primary truncate">{e.userName}</span>
                  <Marquee text={track} className="text-xs text-text-tertiary" />
                </span>
                {e.isPaused
                  ? <Pause size={14} className="shrink-0 text-text-tertiary" aria-label={t('nowPlaying.paused')} />
                  : <Headphones size={14} className="shrink-0 text-accent opacity-0 group-hover:opacity-100" />}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
