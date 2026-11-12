import { socialRequest } from './social'

export interface FriendNowPlaying {
  userId: string
  userName: string
  client: string | null
  deviceName: string | null
  item: { id: string; name: string; artists: string[]; album: string | null; albumId: string | null; runTimeTicks: number | null }
  positionTicks: number
  isPaused: boolean
  lastActivity: string | null
}

const TICKS_PER_SECOND = 10_000_000

export async function listNowPlaying(): Promise<FriendNowPlaying[]> {
  return (await socialRequest<{ items: FriendNowPlaying[] }>('/now-playing')).items
}

/** Friend's estimated position (s) now, given when the entry was fetched; clamped just before the track's end. */
export function joinPositionSeconds(e: FriendNowPlaying, fetchedAt: number, now = Date.now()): number {
  let pos = e.positionTicks / TICKS_PER_SECOND
  if (!e.isPaused) pos += Math.max(0, now - fetchedAt) / 1000
  if (e.item.runTimeTicks) pos = Math.min(pos, e.item.runTimeTicks / TICKS_PER_SECOND - 1)
  return Math.max(0, Math.floor(pos))
}
