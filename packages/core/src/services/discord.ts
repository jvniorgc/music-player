import type { DiscordPresence } from '../platform'
import type { QueueTrack } from './playback'
import { usePlayerStore } from '../stores/player'
import { TICKS_PER_SECOND } from '../lib/format'
import { isPrivateSession, usePrivacyPrefs } from '../stores/prefs/privacy'

/** Minimum interval between Rich Presence pushes (Discord rate-limits updates). */
export const THROTTLE_MS = 2000
/** Position drift (seconds) beyond normal playback that counts as a seek. */
const SEEK_THRESHOLD = 2

type PlayerSnapshot = { currentTrack: QueueTrack | null; isPlaying: boolean; currentTime: number; duration: number }

/** Presence for the current player state; null when paused/stopped. Only plain text — never server URLs. */
export function toPresence(s: PlayerSnapshot): DiscordPresence | null {
  if (!s.currentTrack || !s.isPlaying) return null
  const item = s.currentTrack.item
  return {
    title: item.Name,
    artist: item.Artists?.join(', ') || item.AlbumArtist || '',
    album: item.Album,
    position: s.currentTime,
    duration: item.RunTimeTicks ? item.RunTimeTicks / TICKS_PER_SECOND : s.duration,
  }
}

let enabled = false
let schedule: (() => void) | null = null

export function getDiscordEnabled(): Promise<boolean> {
  return window.api.discordGetEnabled()
}

export async function setDiscordEnabled(value: boolean): Promise<void> {
  await window.api.discordSetEnabled(value)
  enabled = value
  schedule?.()
}

/** Mirror the player store into Discord Rich Presence (throttled). Returns a cleanup function. */
export function initDiscordPresence(): () => void {
  let lastSent: { trackId: string | null; playing: boolean; position: number; at: number } | null = null
  let lastPushAt = -Infinity
  let timer: ReturnType<typeof setTimeout> | null = null

  const push = () => {
    timer = null
    if (!enabled) { lastSent = null; return }
    lastPushAt = Date.now()
    const s = usePlayerStore.getState()
    const presence = isPrivateSession() ? null : toPresence(s)
    lastSent = { trackId: s.currentTrack?.id ?? null, playing: !!presence, position: s.currentTime, at: lastPushAt }
    window.api.discordSetActivity(presence).catch(() => {})
  }

  const request = () => {
    if (timer) return
    timer = setTimeout(push, Math.max(0, lastPushAt + THROTTLE_MS - Date.now()))
  }

  const changed = (s: PlayerSnapshot) => {
    if (!lastSent) return true
    const playing = !isPrivateSession() && !!toPresence(s)
    if (playing !== lastSent.playing) return true
    if (!playing) return false
    if ((s.currentTrack?.id ?? null) !== lastSent.trackId) return true
    const expected = lastSent.position + (Date.now() - lastSent.at) / 1000
    return Math.abs(s.currentTime - expected) > SEEK_THRESHOLD
  }

  const unsubscribe = usePlayerStore.subscribe(s => {
    if (enabled && changed(s)) request()
  })
  schedule = () => { lastSent = null; request() }
  const unsubscribePrivacy = usePrivacyPrefs.subscribe((s, prev) => {
    if (enabled && s.values.privateSession !== prev.values.privateSession) request()
  })

  window.api.discordGetEnabled().then(v => {
    enabled = v
    if (v) request()
  }).catch(() => {})

  return () => {
    unsubscribe()
    unsubscribePrivacy()
    if (timer) clearTimeout(timer)
    timer = null
    schedule = null
    enabled = false
  }
}
