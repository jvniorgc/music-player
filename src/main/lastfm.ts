import { net, shell } from 'electron'
import { createHash } from 'node:crypto'
import { getDatabase } from './database'
import { encryptSecret, decryptSecret, needsMigration } from './secrets'
import type { LastfmStatus, LastfmTrack, LastfmSimilarTrack } from '@music-player/core/platform'

const API_ROOT = 'https://ws.audioscrobbler.com/2.0/'
const AUTH_URL = 'https://www.last.fm/api/auth/'

// Settings keys backing the Last.fm integration.
const KEY_API_KEY = 'lastfm_api_key'
const KEY_API_SECRET = 'lastfm_api_secret'
const KEY_SESSION = 'lastfm_session_key'
const KEY_USERNAME = 'lastfm_username'
const KEY_ENABLED = 'lastfm_enabled'

/** Settings encrypted at rest and never exposed through the generic settings IPC. */
export const SECRET_SETTING_KEYS: readonly string[] = [KEY_API_SECRET, KEY_SESSION]

function getSetting(key: string): string | null {
  const row = getDatabase().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  const raw = row?.value ?? null
  if (!SECRET_SETTING_KEYS.includes(key)) return raw
  const value = decryptSecret(raw)
  if (value !== null && needsMigration(raw)) setSetting(key, value)
  return value
}

function setSetting(key: string, value: string): void {
  const stored = SECRET_SETTING_KEYS.includes(key) ? encryptSecret(value) : value
  getDatabase().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, stored)
}

/** Error raised for Last.fm API-level failures (carries the numeric code). */
export class LastfmApiError extends Error {
  constructor(public code: number, message: string) {
    super(`Last.fm error ${code}: ${message}`)
  }
}

// Temporary failures worth retrying: operation failed, service offline,
// temporarily unavailable, rate limit exceeded.
const RETRYABLE_CODES = new Set([8, 11, 16, 29])
const REQUEST_TIMEOUT_MS = 15_000

function isRetryable(err: unknown): boolean {
  if (err instanceof LastfmApiError) return RETRYABLE_CODES.has(err.code)
  return true // network / timeout / HTTP-level failures
}

interface LastfmJson {
  error?: number
  message?: string
  token?: string
  session?: { name: string; key: string }
  similartracks?: { track?: RawSimilarTrack | RawSimilarTrack[] }
}

interface RawSimilarTrack {
  name?: unknown
  match?: string
  artist?: { name?: unknown }
}

/** Build the Last.fm api_sig: md5 of sorted "name+value" pairs + shared secret. */
function sign(params: Record<string, string>, secret: string): string {
  const keys = Object.keys(params).filter(k => k !== 'format' && k !== 'callback').sort()
  let acc = ''
  for (const k of keys) acc += k + params[k]
  acc += secret
  return createHash('md5').update(acc, 'utf8').digest('hex')
}

async function callApi(params: Record<string, string>, secret: string, method: 'GET' | 'POST'): Promise<LastfmJson> {
  const signed = new URLSearchParams({ ...params, api_sig: sign(params, secret), format: 'json' })
  const body = signed.toString()

  const res = method === 'POST'
    ? await net.fetch(API_ROOT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    : await net.fetch(`${API_ROOT}?${body}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })

  const json = await res.json().catch(() => null) as LastfmJson | null
  if (json && json.error) throw new LastfmApiError(json.error, json.message ?? '')
  if (!res.ok || !json) throw new Error(`Last.fm HTTP ${res.status}`)
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
  const token = json.token
  if (!token) throw new Error('Last.fm returned no token')
  await shell.openExternal(`${AUTH_URL}?api_key=${encodeURIComponent(apiKey)}&token=${encodeURIComponent(token)}`)
  return { token }
}

export async function finishAuth(token: string): Promise<{ username: string }> {
  const apiKey = getSetting(KEY_API_KEY)
  const secret = getSetting(KEY_API_SECRET)
  if (!apiKey || !secret) throw new Error('Last.fm API key/secret not configured')

  const json = await callApi({ method: 'auth.getSession', api_key: apiKey, token }, secret, 'GET')
  if (!json.session) throw new Error('Last.fm returned no session')
  const username = json.session.name
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

/**
 * Scrobble a play. Temporary failures (offline, Last.fm unavailable, rate
 * limited) are persisted to the scrobble queue and retried later, so they
 * resolve instead of throwing. Permanent API errors are rethrown.
 */
export async function scrobble(track: LastfmTrack): Promise<void> {
  const ctx = activeContext()
  if (!ctx) return
  const ts = track.timestamp ?? Math.floor(Date.now() / 1000)
  try {
    await callApi(
      { method: 'track.scrobble', ...trackParams(track), timestamp: String(ts), api_key: ctx.apiKey, sk: ctx.sessionKey },
      ctx.secret,
      'POST',
    )
  } catch (err) {
    if (!isRetryable(err)) throw err
    console.warn('[lastfm] scrobble failed, queued for retry:', err instanceof Error ? err.message : err)
    enqueueScrobble({ ...track, timestamp: ts })
    return
  }
  // We're online: drain anything queued earlier.
  flushScrobbleQueue().catch(err => console.warn('[lastfm] queue flush failed', err))
}

// --- Durable offline scrobble queue ---

/** Last.fm rejects scrobbles older than 14 days. */
export const MAX_SCROBBLE_AGE_S = 14 * 24 * 60 * 60
/** Last.fm accepts at most 50 scrobbles per batch. */
export const SCROBBLE_BATCH_SIZE = 50
const BASE_BACKOFF_S = 60
const MAX_BACKOFF_S = 6 * 60 * 60
const FLUSH_INTERVAL_MS = 5 * 60 * 1000

interface QueueRow { id: number; track: string; timestamp: number; attempts: number }

const nowS = () => Math.floor(Date.now() / 1000)

export function backoffSeconds(attempts: number): number {
  return Math.min(BASE_BACKOFF_S * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_S)
}

export function enqueueScrobble(track: LastfmTrack & { timestamp: number }): void {
  if (track.timestamp < nowS() - MAX_SCROBBLE_AGE_S) return
  getDatabase()
    .prepare('INSERT INTO scrobble_queue (track, timestamp, attempts, next_attempt_at) VALUES (?, ?, 0, 0)')
    .run(JSON.stringify(track), track.timestamp)
}

export function getQueuedScrobbleCount(): number {
  return (getDatabase().prepare('SELECT COUNT(*) AS c FROM scrobble_queue').get() as { c: number }).c
}

let flushing: Promise<number> | null = null

/**
 * Submit due queued scrobbles in batches of up to 50. Expired entries (older
 * than 14 days) are dropped. Failed batches back off exponentially (bounded).
 * Returns the number of scrobbles successfully submitted.
 */
export function flushScrobbleQueue(now: number = nowS()): Promise<number> {
  if (!flushing) {
    flushing = doFlush(now).finally(() => { flushing = null })
  }
  return flushing
}

async function doFlush(now: number): Promise<number> {
  const db = getDatabase()
  db.prepare('DELETE FROM scrobble_queue WHERE timestamp < ?').run(now - MAX_SCROBBLE_AGE_S)
  const ctx = activeContext()
  if (!ctx) return 0

  let sent = 0
  for (;;) {
    const rows = db.prepare(
      'SELECT id, track, timestamp, attempts FROM scrobble_queue WHERE next_attempt_at <= ? ORDER BY timestamp ASC LIMIT ?'
    ).all(now, SCROBBLE_BATCH_SIZE) as QueueRow[]
    if (rows.length === 0) return sent

    const params: Record<string, string> = { method: 'track.scrobble', api_key: ctx.apiKey, sk: ctx.sessionKey }
    const valid: QueueRow[] = []
    for (const row of rows) {
      let t: LastfmTrack
      try {
        t = JSON.parse(row.track) as LastfmTrack
      } catch {
        db.prepare('DELETE FROM scrobble_queue WHERE id = ?').run(row.id)
        continue
      }
      const i = valid.length
      for (const [k, v] of Object.entries(trackParams(t))) params[`${k}[${i}]`] = v
      params[`timestamp[${i}]`] = String(row.timestamp)
      valid.push(row)
    }
    if (valid.length === 0) continue

    const ids = valid.map(r => r.id)
    const placeholders = ids.map(() => '?').join(',')
    try {
      await callApi(params, ctx.secret, 'POST')
      db.prepare(`DELETE FROM scrobble_queue WHERE id IN (${placeholders})`).run(...ids)
      sent += valid.length
    } catch (err) {
      if (!isRetryable(err)) {
        // Permanently rejected (e.g. invalid params): don't retry forever.
        console.warn('[lastfm] dropping rejected queued scrobbles:', err instanceof Error ? err.message : err)
        db.prepare(`DELETE FROM scrobble_queue WHERE id IN (${placeholders})`).run(...ids)
        continue
      }
      console.warn('[lastfm] queued scrobble retry failed:', err instanceof Error ? err.message : err)
      const update = db.prepare('UPDATE scrobble_queue SET attempts = ?, next_attempt_at = ? WHERE id = ?')
      for (const r of valid) update.run(r.attempts + 1, now + backoffSeconds(r.attempts + 1), r.id)
      return sent
    }
  }
}

let queueTimer: ReturnType<typeof setInterval> | null = null

/** Flush once shortly after startup, then periodically. */
export function startScrobbleQueue(): void {
  if (queueTimer) return
  const run = () => { flushScrobbleQueue().catch(err => console.warn('[lastfm] queue flush failed', err)) }
  setTimeout(run, 10_000).unref?.()
  queueTimer = setInterval(run, FLUSH_INTERVAL_MS)
  queueTimer.unref?.()
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
  const res = await net.fetch(`${API_ROOT}?${params.toString()}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  const json = await res.json() as LastfmJson
  if (json && json.error) throw new LastfmApiError(json.error, json.message ?? '')

  // Last.fm returns an array normally, a bare object for a single result, and
  // omits `track` entirely when there are no matches.
  const raw = json?.similartracks?.track
  const list: RawSimilarTrack[] = Array.isArray(raw) ? raw : raw ? [raw] : []
  return list
    .map((t): LastfmSimilarTrack | null => {
      const name = typeof t?.name === 'string' ? t.name : ''
      const artistName = typeof t?.artist?.name === 'string' ? t.artist.name : ''
      if (!name || !artistName) return null
      const match = Number.parseFloat(String(t?.match ?? '0'))
      return { artist: artistName, track: name, match: Number.isFinite(match) ? match : 0 }
    })
    .filter((t): t is LastfmSimilarTrack => t !== null)
}

/** Read-only Last.fm `*.getInfo` methods the renderer may request for popularity data. */
export const INFO_METHODS = ['album.getInfo', 'track.getInfo', 'artist.getInfo'] as const
export type LastfmInfoMethod = typeof INFO_METHODS[number]
const INFO_PARAMS = new Set(['artist', 'album', 'track', 'mbid'])
const NOT_FOUND_CODE = 6

/**
 * Unauthenticated `album|track|artist.getInfo` lookup (only the API key is
 * needed). The linked username is added so Last.fm includes `userplaycount`.
 * Returns the raw JSON, or null when no API key is configured or Last.fm
 * reports the item as not found. Other failures throw.
 */
export async function getInfo(method: string, params: Record<string, string>): Promise<Record<string, unknown> | null> {
  if (!(INFO_METHODS as readonly string[]).includes(method)) throw new Error(`Unsupported Last.fm method: ${method}`)
  const apiKey = getSetting(KEY_API_KEY)
  if (!apiKey) return null

  const query = new URLSearchParams({ method, api_key: apiKey, autocorrect: '1', format: 'json' })
  for (const [k, v] of Object.entries(params ?? {})) {
    if (INFO_PARAMS.has(k) && typeof v === 'string' && v) query.set(k, v)
  }
  const username = getSetting(KEY_USERNAME)
  if (username) query.set('username', username)

  const res = await net.fetch(`${API_ROOT}?${query.toString()}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  const json = await res.json().catch(() => null) as (LastfmJson & Record<string, unknown>) | null
  if (json?.error === NOT_FOUND_CODE) return null
  if (json?.error) throw new LastfmApiError(json.error, json.message ?? '')
  if (!res.ok || !json) throw new Error(`Last.fm HTTP ${res.status}`)
  return json
}
