import { isConfigured, socialRequest } from './social'
import { jellyfin } from './jellyfin'

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

interface JfSession {
  UserId?: string
  UserName?: string
  Client?: string
  DeviceName?: string
  LastActivityDate?: string
  NowPlayingItem?: { Id: string; Name: string; Type?: string; Artists?: string[]; Album?: string; AlbumId?: string; RunTimeTicks?: number }
  PlayState?: { PositionTicks?: number; IsPaused?: boolean }
}

function toEntry(s: JfSession): FriendNowPlaying | null {
  const it = s.NowPlayingItem
  if (!it || it.Type !== 'Audio' || !s.UserId) return null
  return {
    userId: s.UserId, userName: s.UserName ?? '', client: s.Client ?? null, deviceName: s.DeviceName ?? null,
    item: { id: it.Id, name: it.Name, artists: it.Artists ?? [], album: it.Album ?? null, albumId: it.AlbumId ?? null, runTimeTicks: it.RunTimeTicks ?? null },
    positionTicks: s.PlayState?.PositionTicks ?? 0,
    isPaused: s.PlayState?.IsPaused ?? false,
    lastActivity: s.LastActivityDate ?? null,
  }
}

async function fromJellyfin(): Promise<FriendNowPlaying[]> {
  const sessions = await jellyfin.getSessions<JfSession>()
  return sessions.map(toEntry).filter((e): e is FriendNowPlaying => e !== null && e.userId !== jellyfin.userId)
}

/** Friends' playback via the social API, falling back to Jellyfin's own sessions (covers any client). */
export async function listNowPlaying(): Promise<FriendNowPlaying[]> {
  if (isConfigured()) {
    try {
      return (await socialRequest<{ items: FriendNowPlaying[] }>('/now-playing')).items
    } catch {
      // fall through to Jellyfin
    }
  }
  return fromJellyfin()
}

/** Friend's estimated position (s) now, given when the entry was fetched; clamped just before the track's end. */
export function joinPositionSeconds(e: FriendNowPlaying, fetchedAt: number, now = Date.now()): number {
  let pos = e.positionTicks / TICKS_PER_SECOND
  if (!e.isPaused) pos += Math.max(0, now - fetchedAt) / 1000
  if (e.item.runTimeTicks) pos = Math.min(pos, e.item.runTimeTicks / TICKS_PER_SECOND - 1)
  return Math.max(0, Math.floor(pos))
}
