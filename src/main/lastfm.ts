import { net, shell } from 'electron'
import { createHash } from 'node:crypto'
import { getDatabase } from './database'
import type { LastfmStatus, LastfmTrack, LastfmSimilarTrack } from '@music-player/core/platform'

const API_ROOT = 'https://ws.audioscrobbler.com/2.0/'
const AUTH_URL = 'https://www.last.fm/api/auth/'

// Settings keys backing the Last.fm integration.
const KEY_API_KEY = 'lastfm_api_key'
const KEY_API_SECRET = 'lastfm_api_secret'
const KEY_SESSION = 'lastfm_session_key'
const KEY_USERNAME = 'lastfm_username'
const KEY_ENABLED = 'lastfm_enabled'

function getSetting(key: string): string | null {
  const row = getDatabase().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

function setSetting(key: string, value: string): void {
  getDatabase().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
}

/** Build the Last.fm api_sig: md5 of sorted "name+value" pairs + shared secret. */
function sign(params: Record<string, string>, secret: string): string {
  const keys = Object.keys(params).filter(k => k !== 'format' && k !== 'callback').sort()
  let acc = ''
  for (const k of keys) acc += k + params[k]
  acc += secret
  return createHash('md5').update(acc, 'utf8').digest('hex')
}

async function callApi(params: Record<string, string>, secret: string, method: 'GET' | 'POST'): Promise<any> {
  const signed = new URLSearchParams({ ...params, api_sig: sign(params, secret), format: 'json' })
  const body = signed.toString()

  const res = method === 'POST'
    ? await net.fetch(API_ROOT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
    : await net.fetch(`${API_ROOT}?${body}`)

  const json = await res.json()
  if (json && json.error) throw new Error(`Last.fm error ${json.error}: ${json.message}`)
  return json
}

function trackParams(track: LastfmTrack): Record<string, string> {
  const p: Record<string, string> = { artist: track.artist, track: track.track }
  if (track.album) p.album = track.album
  if (track.albumArtist) p.albumArtist = track.albumArtist
  if (track.duration) p.duration = String(track.duration)
  return p
}

/** Credentials needed for an authenticated, enabled scrobble; null otherwise. */
function activeContext(): { apiKey: string; secret: string; sessionKey: string } | null {
  const enabled = getSetting(KEY_ENABLED) === '1'
  const apiKey = getSetting(KEY_API_KEY)
  const secret = getSetting(KEY_API_SECRET)
  const sessionKey = getSetting(KEY_SESSION)
  if (!enabled || !apiKey || !secret || !sessionKey) return null
  return { apiKey, secret, sessionKey }
}

export function getStatus(): LastfmStatus {
  const apiKey = getSetting(KEY_API_KEY)
  const secret = getSetting(KEY_API_SECRET)
  const sessionKey = getSetting(KEY_SESSION)
  return {
    configured: !!apiKey && !!secret,
    connected: !!sessionKey,
    enabled: getSetting(KEY_ENABLED) === '1',
    username: getSetting(KEY_USERNAME),
  }
}

export function setCredentials(apiKey: string, apiSecret: string): void {
  setSetting(KEY_API_KEY, apiKey)
  setSetting(KEY_API_SECRET, apiSecret)
}

export function setEnabled(enabled: boolean): void {
  setSetting(KEY_ENABLED, enabled ? '1' : '0')
}

export function disconnect(): void {
  getDatabase().prepare(`DELETE FROM settings WHERE key IN ('${KEY_SESSION}', '${KEY_USERNAME}')`).run()
}

export async function startAuth(): Promise<{ token: string }> {
  const apiKey = getSetting(KEY_API_KEY)
  const secret = getSetting(KEY_API_SECRET)
  if (!apiKey || !secret) throw new Error('Last.fm API key/secret not configured')

  const json = await callApi({ method: 'auth.getToken', api_key: apiKey }, secret, 'GET')
  const token = json.token as string
  await shell.openExternal(`${AUTH_URL}?api_key=${encodeURIComponent(apiKey)}&token=${encodeURIComponent(token)}`)
  return { token }
}

export async function finishAuth(token: string): Promise<{ username: string }> {
  const apiKey = getSetting(KEY_API_KEY)
  const secret = getSetting(KEY_API_SECRET)
  if (!apiKey || !secret) throw new Error('Last.fm API key/secret not configured')

  const json = await callApi({ method: 'auth.getSession', api_key: apiKey, token }, secret, 'GET')
  const username = json.session.name as string
  setSetting(KEY_SESSION, json.session.key)
  setSetting(KEY_USERNAME, username)
  return { username }
}

export async function updateNowPlaying(track: LastfmTrack): Promise<void> {
  const ctx = activeContext()
  if (!ctx) return
  await callApi(
    { method: 'track.updateNowPlaying', ...trackParams(track), api_key: ctx.apiKey, sk: ctx.sessionKey },
    ctx.secret,
    'POST',
  )
}

export async function scrobble(track: LastfmTrack): Promise<void> {
  const ctx = activeContext()
  if (!ctx) return
  const timestamp = String(track.timestamp ?? Math.floor(Date.now() / 1000))
  await callApi(
    { method: 'track.scrobble', ...trackParams(track), timestamp, api_key: ctx.apiKey, sk: ctx.sessionKey },
    ctx.secret,
    'POST',
  )
}

/**
 * Fetch similar-track recommendations for a seed via Last.fm `track.getSimilar`.
 * This is an unauthenticated read (only the API key is required), so it works
 * even when scrobbling is disabled or no account is linked. Returns [] when the
 * API key is missing or the seed is incomplete.
 */
export async function getSimilarTracks(artist: string, track: string, limit = 50): Promise<LastfmSimilarTrack[]> {
  const apiKey = getSetting(KEY_API_KEY)
  if (!apiKey || !artist || !track) return []

  const params = new URLSearchParams({
    method: 'track.getSimilar',
    artist,
    track,
    api_key: apiKey,
    autocorrect: '1',
    limit: String(limit),
    format: 'json',
  })
  const res = await net.fetch(`${API_ROOT}?${params.toString()}`)
  const json = await res.json()
  if (json && json.error) throw new Error(`Last.fm error ${json.error}: ${json.message}`)

  // Last.fm returns an array normally, a bare object for a single result, and
  // omits `track` entirely when there are no matches.
  const raw = json?.similartracks?.track
  const list: any[] = Array.isArray(raw) ? raw : raw ? [raw] : []
  return list
    .map((t): LastfmSimilarTrack | null => {
      const name = typeof t?.name === 'string' ? t.name : ''
      const artistName = typeof t?.artist?.name === 'string' ? t.artist.name : ''
      if (!name || !artistName) return null
      const match = Number.parseFloat(t?.match ?? '0')
      return { artist: artistName, track: name, match: Number.isFinite(match) ? match : 0 }
    })
    .filter((t): t is LastfmSimilarTrack => t !== null)
}
