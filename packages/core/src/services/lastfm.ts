import type { JellyfinItem } from './jellyfin'
import type { LastfmStatus, LastfmTrack } from '../platform'

// Last.fm scrobbling rules: a track must be longer than 30s and must have been
// played for at least half its length OR for 4 minutes, whichever comes first.
const MIN_TRACK_SECONDS = 30
const SCROBBLE_THRESHOLD_SECONDS = 240

const TICKS_PER_SECOND = 10_000_000

/** Translate a Jellyfin track into Last.fm scrobble metadata, or null if unusable. */
export function toScrobbleMeta(item: JellyfinItem): LastfmTrack | null {
  const artist = item.Artists?.[0] || item.AlbumArtist || ''
  const track = item.Name || ''
  if (!artist || !track) return null

  const meta: LastfmTrack = { artist, track }
  if (item.Album) meta.album = item.Album
  if (item.AlbumArtist) meta.albumArtist = item.AlbumArtist
  if (item.RunTimeTicks) meta.duration = Math.round(item.RunTimeTicks / TICKS_PER_SECOND)
  return meta
}

/** Whether the amount played qualifies the track to be scrobbled. */
export function shouldScrobble(playedSeconds: number, durationSeconds: number): boolean {
  if (durationSeconds < MIN_TRACK_SECONDS) return false
  if (playedSeconds >= SCROBBLE_THRESHOLD_SECONDS) return true
  return playedSeconds >= durationSeconds / 2
}

/** Report the currently playing track to Last.fm (best-effort; main no-ops if not linked). */
export async function nowPlaying(item: JellyfinItem): Promise<void> {
  const meta = toScrobbleMeta(item)
  if (!meta) return
  await window.api.lastfmNowPlaying(meta)
}

/** Scrobble a finished track, stamped with the unix time playback started. */
export async function scrobble(item: JellyfinItem, timestamp: number): Promise<void> {
  const meta = toScrobbleMeta(item)
  if (!meta) return
  await window.api.lastfmScrobble({ ...meta, timestamp })
}

export function getStatus(): Promise<LastfmStatus> {
  return window.api.lastfmGetStatus()
}

export function setCredentials(apiKey: string, apiSecret: string): Promise<void> {
  return window.api.lastfmSetCredentials(apiKey, apiSecret)
}

export function setEnabled(enabled: boolean): Promise<void> {
  return window.api.lastfmSetEnabled(enabled)
}

export function startAuth(): Promise<{ token: string }> {
  return window.api.lastfmStartAuth()
}

export function finishAuth(token: string): Promise<{ username: string }> {
  return window.api.lastfmFinishAuth(token)
}

export function disconnect(): Promise<void> {
  return window.api.lastfmDisconnect()
}
