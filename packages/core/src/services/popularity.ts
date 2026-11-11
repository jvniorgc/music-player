import { create } from 'zustand'
import type { JellyfinItem } from './jellyfin'
import type { LastfmInfoMethod } from '../platform'

/** Settings key (SQLite settings table, via window.api) for the popularity toggle. */
export const POPULARITY_SETTING_KEY = 'lastfm_show_popularity'
export const CACHE_STORAGE_KEY = 'lastfm_popularity_cache_v1'
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const NEGATIVE_TTL_MS = 24 * 60 * 60 * 1000
const MAX_CACHE_ENTRIES = 3000
/** Last.fm allows ~5 req/s: keep ≤3 in flight and start at most one every 200ms. */
export const MAX_CONCURRENT = 3
export const MIN_START_INTERVAL_MS = 200

export interface PopularityStats {
  listeners: number
  playcount: number
  /** The linked Last.fm user's own playcount (only when a username is linked). */
  userPlaycount?: number
}

interface PopularityState {
  /** User toggle (persisted). */
  enabled: boolean
  /** Whether a Last.fm API key is configured. */
  available: boolean
  loaded: boolean
  /** Highest track playcount seen per list (album/playlist id), for relative meters. */
  maxPlays: Record<string, number>
}

export const usePopularityStore = create<PopularityState>(() => ({
  enabled: false,
  available: false,
  loaded: false,
  maxPlays: {},
}))

let loading: Promise<void> | null = null

/** Read the persisted toggle and API-key availability (once; pass force to refresh). */
export function loadPopularitySettings(force = false): Promise<void> {
  if (loading && !force) return loading
  loading = (async () => {
    const [value, status] = await Promise.all([
      window.api.getSetting(POPULARITY_SETTING_KEY).catch(() => null),
      window.api.lastfmGetStatus().catch(() => null),
    ])
    usePopularityStore.setState({ enabled: value === '1', available: !!status?.configured, loaded: true })
  })()
  return loading
}

export async function setPopularityEnabled(enabled: boolean): Promise<void> {
  usePopularityStore.setState({ enabled })
  await window.api.setSetting(POPULARITY_SETTING_KEY, enabled ? '1' : '0')
}

/** Whether lookups should run: toggle on and an API key configured. */
export function isPopularityActive(): boolean {
  const s = usePopularityStore.getState()
  return s.enabled && s.available
}

/** Track the max playcount for a list and return it. */
export function reportTrackPlays(group: string, plays: number): void {
  const current = usePopularityStore.getState().maxPlays[group] ?? 0
  if (plays > current) {
    usePopularityStore.setState(s => ({ maxPlays: { ...s.maxPlays, [group]: plays } }))
  }
}

/** Number of lit bars (0–5) for a track relative to the list's most-played track. */
export function meterLevel(plays: number, max: number): number {
  if (plays <= 0 || max <= 0) return 0
  return Math.max(1, Math.min(5, Math.ceil((plays / max) * 5)))
}

// --- Name normalization ---

const NOISE = '(?:remaster(?:ed)?|deluxe|edition|expanded|anniversary|bonus track|mono|stereo|version)'
const BRACKET_NOISE = new RegExp(`\\s*[([][^)\\]]*(?:${NOISE}|\\bfeat\\.?|\\bft\\.|\\bfeaturing\\b)[^)\\]]*[)\\]]`, 'gi')
const DASH_NOISE = new RegExp(`\\s+[-–—]\\s+[^-–—]*${NOISE}[^-–—]*$`, 'i')
const TRAILING_FEAT = /\s+(?:feat\.?|ft\.|featuring)\s+.*$/i

/** Strip remaster/deluxe/edition/featuring decorations so Last.fm matches the canonical entry. */
export function normalizeName(name: string): string {
  const original = name.trim()
  const cleaned = original
    .replace(BRACKET_NOISE, '')
    .replace(DASH_NOISE, '')
    .replace(TRAILING_FEAT, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return cleaned || original
}

// --- Parsing ---

function num(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

/** Extract stats from a raw `album|track|artist.getInfo` response. */
export function parseStats(method: LastfmInfoMethod, json: Record<string, any> | null): PopularityStats | null {
  const root = method === 'album.getInfo' ? json?.album
    : method === 'track.getInfo' ? json?.track
    : json?.artist?.stats
  const listeners = num(root?.listeners)
  const playcount = num(root?.playcount)
  if (listeners === undefined || playcount === undefined) return null
  const stats: PopularityStats = { listeners, playcount }
  const user = num(root.userplaycount)
  if (user !== undefined) stats.userPlaycount = user
  return stats
}

// --- Cache (memory + localStorage) ---

interface CacheEntry { v: PopularityStats | null; exp: number }

let memory: Map<string, CacheEntry> | null = null
const inflight = new Map<string, Promise<PopularityStats | null>>()

function cache(): Map<string, CacheEntry> {
  if (memory) return memory
  memory = new Map()
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_STORAGE_KEY) ?? '{}') as Record<string, CacheEntry>
    const now = Date.now()
    for (const [k, e] of Object.entries(raw)) if (e && e.exp > now) memory.set(k, e)
  } catch { /* corrupt cache: start fresh */ }
  return memory
}

let persistTimer: ReturnType<typeof setTimeout> | null = null

function schedulePersist(): void {
  if (persistTimer) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    const entries = [...cache().entries()].slice(-MAX_CACHE_ENTRIES)
    try { localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries))) } catch { /* quota */ }
  }, 500)
}

function cacheGet(key: string): CacheEntry | undefined {
  const e = cache().get(key)
  if (!e) return undefined
  if (e.exp <= Date.now()) {
    cache().delete(key)
    return undefined
  }
  return e
}

function cacheSet(key: string, v: PopularityStats | null): void {
  const m = cache()
  m.delete(key)
  m.set(key, { v, exp: Date.now() + (v ? CACHE_TTL_MS : NEGATIVE_TTL_MS) })
  schedulePersist()
}

/** Synchronous cache read (undefined = not cached) so rows can render without a flash. */
export function peekCached(key: string): PopularityStats | null | undefined {
  return cacheGet(key)?.v
}

/** Reset all in-memory state (tests). */
export function _resetPopularity(): void {
  memory = null
  inflight.clear()
  queue.length = 0
  active = 0
  lastStart = 0
  loading = null
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = null
  usePopularityStore.setState({ enabled: false, available: false, loaded: false, maxPlays: {} })
}

// --- Rate-limited request queue ---

const queue: (() => void)[] = []
let active = 0
let lastStart = 0

function pump(): void {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const wait = lastStart + MIN_START_INTERVAL_MS - Date.now()
    if (wait > 0) {
      setTimeout(pump, wait)
      return
    }
    lastStart = Date.now()
    active++
    queue.shift()!()
  }
}

function schedule<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push(() => {
      fn().then(resolve, reject).finally(() => {
        active--
        pump()
      })
    })
    pump()
  })
}

function request(method: LastfmInfoMethod, params: Record<string, string>): Promise<PopularityStats | null> {
  return schedule(() => window.api.lastfmGetInfo(method, params)).then(json => parseStats(method, json))
}

/**
 * Cached + deduplicated lookup. Never rejects: errors resolve to null and are
 * not persisted (so they're retried later); not-found results are cached for a day.
 */
function lookup(key: string, load: () => Promise<PopularityStats | null>): Promise<PopularityStats | null> {
  if (!isPopularityActive()) return Promise.resolve(null)
  const hit = cacheGet(key)
  if (hit) return Promise.resolve(hit.v)
  const pending = inflight.get(key)
  if (pending) return pending
  const p = load()
    .then(v => { cacheSet(key, v); return v })
    .catch(() => null)
    .finally(() => { inflight.delete(key) })
  inflight.set(key, p)
  return p
}

const lc = (s: string) => s.toLowerCase()

export function albumKey(item: JellyfinItem): string {
  const artist = normalizeName(item.AlbumArtist || item.Artists?.[0] || '')
  return `album:${lc(artist)}|${lc(normalizeName(item.Name || ''))}`
}

export function trackKey(artist: string, track: string): string {
  return `track:${lc(normalizeName(artist))}|${lc(normalizeName(track))}`
}

export function artistKey(name: string): string {
  return `artist:${lc(normalizeName(name))}`
}

export function getAlbumStats(item: JellyfinItem): Promise<PopularityStats | null> {
  const artist = normalizeName(item.AlbumArtist || item.Artists?.[0] || '')
  const album = normalizeName(item.Name || '')
  if (!artist || !album) return Promise.resolve(null)
  const mbid = item.ProviderIds?.MusicBrainzAlbum
  return lookup(albumKey(item), async () => {
    if (mbid) {
      const byId = await request('album.getInfo', { mbid })
      if (byId) return byId
    }
    return request('album.getInfo', { artist, album })
  })
}

export function getTrackStats(artist: string, track: string): Promise<PopularityStats | null> {
  const a = normalizeName(artist)
  const t = normalizeName(track)
  if (!a || !t) return Promise.resolve(null)
  return lookup(trackKey(a, t), () => request('track.getInfo', { artist: a, track: t }))
}

export function getArtistStats(name: string): Promise<PopularityStats | null> {
  const a = normalizeName(name)
  if (!a) return Promise.resolve(null)
  return lookup(artistKey(a), () => request('artist.getInfo', { artist: a }))
}

/** Artist name to use for a track's Last.fm lookup. */
export function trackArtist(item: JellyfinItem): string {
  return item.Artists?.[0] || item.AlbumArtist || ''
}
