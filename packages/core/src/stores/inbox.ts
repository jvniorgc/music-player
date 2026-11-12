import { create } from 'zustand'
import { isConfigured, loadConfig } from '../services/social'
import { getInbox, getUnreadCount, markListened, matchesTrack, type FriendRec } from '../services/friendRecs'
import { usePlayerStore } from './player'
import { isPrivateSession } from './prefs/privacy'

export const INBOX_POLL_MS = 60_000

interface InboxState {
  configured: boolean
  unread: number
  /** Cached unread recommendations (null = needs fetching). */
  pending: FriendRec[] | null
  refresh: () => Promise<void>
}

export const useInboxStore = create<InboxState>((set, get) => ({
  configured: false,
  unread: 0,
  pending: null,
  refresh: async () => {
    if (!get().configured) return
    try {
      const unread = await getUnreadCount()
      if (unread !== get().unread) set({ unread, pending: null })
    } catch { /* offline: keep the last count */ }
  },
}))

/** Loads the social config and polls the unread count; returns a stop function. */
export function startInboxPolling(): () => void {
  let timer: ReturnType<typeof setInterval> | undefined
  let stopped = false
  loadConfig().then(() => {
    if (stopped || !isConfigured()) return
    useInboxStore.setState({ configured: true })
    useInboxStore.getState().refresh()
    timer = setInterval(() => useInboxStore.getState().refresh(), INBOX_POLL_MS)
  })
  return () => { stopped = true; clearInterval(timer) }
}

async function checkTrack(track: { Id: string; AlbumId?: string }): Promise<void> {
  try {
    const s = useInboxStore.getState()
    const pending = s.pending ?? await getInbox(true)
    const hits = pending.filter(r => matchesTrack(r, track))
    useInboxStore.setState({ pending: pending.filter(r => !hits.includes(r)) })
    if (hits.length === 0) return
    await Promise.all(hits.map(r => markListened(r.id)))
    useInboxStore.setState(st => ({ unread: Math.max(0, st.unread - hits.length) }))
  } catch { /* best effort */ }
}

/** Marks recommendations as listened when the recipient plays them; playback itself is untouched. */
export function initInboxAutoListen(): () => void {
  return usePlayerStore.subscribe((state, prev) => {
    const item = state.currentTrack?.item
    if (!item || item.Id === prev.currentTrack?.item.Id) return
    const { configured, unread } = useInboxStore.getState()
    if (!configured || unread === 0 || isPrivateSession()) return
    checkTrack(item)
  })
}
