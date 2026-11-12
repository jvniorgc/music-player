import { socialRequest, isConfigured, type SocialUser } from './social'
import type { QueueTrack } from './playback'
import type { JellyfinItem } from './jellyfin'
import { usePlayerStore } from '../stores/player'
import { isPrivateSession } from '../stores/prefs/privacy'
import { TICKS_PER_SECOND } from '../lib/format'

/** A play counts after half the track or 4 minutes of actual listening, whichever comes first. */
export const PLAY_THRESHOLD_SECONDS = 240
/** Position jumps larger than this (seconds) are seeks, not listening. */
const MAX_TICK_SECONDS = 5

export interface PlayPayload {
  trackId: string; trackName: string; artists: string[]; artistId?: string
  albumId: string; albumName: string; durationS: number; playedAt: number
}

export interface RankedItem { id: string | null; name: string; artists?: string; albumId?: string; plays: number; minutes: number }
export interface Listener { user: SocialUser; plays: number; minutes: number }
export interface WeekRanking {
  start: string; end: string
  tracks: RankedItem[]; albums: RankedItem[]; artists: RankedItem[]; listeners: Listener[]
}
export interface Discovery { albumId: string; albumName: string; artists: string; user: SocialUser; playedAt: string }
export interface AchievementSummary { id: string; threshold: number; unlocked: { user: SocialUser; value: number }[] }
export interface MyAchievement { id: string; threshold: number; value: number; unlocked: boolean }

export function playThreshold(durationS: number): number {
  return durationS > 0 ? Math.min(durationS / 2, PLAY_THRESHOLD_SECONDS) : PLAY_THRESHOLD_SECONDS
}

/** Scrobble payload for a Jellyfin track, or null when it lacks the album info rankings need. */
export function toPlay(item: JellyfinItem, durationS: number, playedAt: number): PlayPayload | null {
  if (!item.Id || !item.Name || !item.AlbumId || !item.Album) return null
  const artists = item.Artists?.length ? item.Artists : item.AlbumArtist ? [item.AlbumArtist] : []
  const artistId = item.ArtistItems?.[0]?.Id ?? item.AlbumArtists?.[0]?.Id
  const runtime = item.RunTimeTicks ? item.RunTimeTicks / TICKS_PER_SECOND : durationS
  return {
    trackId: item.Id, trackName: item.Name, artists, ...(artistId ? { artistId } : {}),
    albumId: item.AlbumId, albumName: item.Album, durationS: Math.round(runtime), playedAt,
  }
}

/** Fire-and-forget: failures (offline, server down) are dropped, never retried. */
export function reportPlay(play: PlayPayload): void {
  if (!isConfigured() || isPrivateSession()) return
  socialRequest('/plays', { method: 'POST', body: JSON.stringify(play) })
    .catch(err => console.warn('[plays] report failed:', err))
}

/**
 * Watches the player store and reports each playback instance once it was listened to long enough.
 * Only listened time counts (seeks are ignored); replaying the same track starts a new instance.
 */
export function initPlayScrobbler(): () => void {
  let track: QueueTrack | null = null
  let listened = 0
  let lastTime = 0
  let reported = false
  let startedAt = 0

  return usePlayerStore.subscribe(s => {
    const cur = s.currentTrack
    const restarted = cur === track && reported && s.currentTime < lastTime - MAX_TICK_SECONDS && s.currentTime < 2
    if (cur !== track || restarted) {
      track = cur
      listened = 0
      reported = false
      startedAt = Date.now()
      lastTime = s.currentTime
      return
    }
    const delta = s.currentTime - lastTime
    lastTime = s.currentTime
    if (!cur || reported || !s.isPlaying || delta <= 0 || delta > MAX_TICK_SECONDS) return
    listened += delta
    const play = toPlay(cur.item, s.duration, startedAt)
    if (!play || listened < playThreshold(play.durationS)) return
    reported = true
    reportPlay(play)
  })
}

export function getWeekRanking(offset = 0): Promise<WeekRanking> {
  return socialRequest<WeekRanking>(`/rankings/week?offset=${offset}`)
}

export async function getDiscoveries(albumIds: string[]): Promise<Discovery[]> {
  if (!albumIds.length) return []
  return (await socialRequest<{ items: Discovery[] }>(`/discoveries?albumIds=${albumIds.map(encodeURIComponent).join(',')}`)).items
}

export async function getRecentDiscoveries(): Promise<Discovery[]> {
  return (await socialRequest<{ items: Discovery[] }>('/discoveries/recent')).items
}

export async function getAchievements(): Promise<AchievementSummary[]> {
  return (await socialRequest<{ items: AchievementSummary[] }>('/achievements')).items
}

export async function getMyAchievements(): Promise<MyAchievement[]> {
  return (await socialRequest<{ items: MyAchievement[] }>('/achievements/me')).items
}
