import type { JellyfinItem } from '../services/jellyfin'
import type { PlaybackContext, PlaybackContextType, PlaybackSnapshot, RepeatMode } from '../services/playback'

export const SESSION_KEY = 'playback_session'
export const SESSION_VERSION = 1
/** Upper bound on stored tracks (context + user queue). */
export const MAX_STORED_TRACKS = 500
/** Context tracks kept before the current position (for "previous"). */
const KEEP_BEFORE = 50

export interface SessionOwner {
  serverUrl: string
  userId: string
}

interface StoredSession extends PlaybackSnapshot {
  v: number
  owner: SessionOwner
  savedAt: number
}

const REPEAT_MODES: RepeatMode[] = ['none', 'all', 'one']
const CONTEXT_TYPES: PlaybackContextType[] = ['album', 'playlist', 'artist', 'songs', 'search', 'home', 'library', 'mix', 'radio', 'downloads', 'liked', 'custom']

/** Only the fields the UI needs to render/play a queued track. */
export function minimalItem(item: JellyfinItem): JellyfinItem {
  const out: JellyfinItem = { Id: item.Id, Name: item.Name, Type: item.Type || 'Audio' }
  if (item.AlbumId) out.AlbumId = item.AlbumId
  if (item.Album) out.Album = item.Album
  if (item.AlbumArtist) out.AlbumArtist = item.AlbumArtist
  if (item.Artists?.length) out.Artists = item.Artists
  if (item.ArtistItems?.length) out.ArtistItems = item.ArtistItems.map(a => ({ Id: a.Id, Name: a.Name }))
  if (item.AlbumArtists?.length) out.AlbumArtists = item.AlbumArtists.map(a => ({ Id: a.Id, Name: a.Name }))
  if (item.RunTimeTicks) out.RunTimeTicks = item.RunTimeTicks
  if (item.IndexNumber != null) out.IndexNumber = item.IndexNumber
  if (item.ImageTags?.Primary) out.ImageTags = { Primary: item.ImageTags.Primary }
  return out
}

/** Builds the stored form of a snapshot, capped to MAX_STORED_TRACKS. */
export function serializeSession(snap: PlaybackSnapshot, owner: SessionOwner, now = Date.now()): string {
  const userQueue = snap.userQueue.slice(0, MAX_STORED_TRACKS - 1)
  const budget = MAX_STORED_TRACKS - 1 - userQueue.length
  let items = snap.items
  let position = snap.position
  if (items.length > budget) {
    const start = position < 0 ? 0 : Math.max(0, Math.min(position - KEEP_BEFORE, items.length - budget))
    items = items.slice(start, start + budget)
    position = position < 0 ? -1 : position - start
  }
  const stored: StoredSession = {
    v: SESSION_VERSION,
    owner,
    savedAt: now,
    current: minimalItem(snap.current),
    items: items.map(minimalItem),
    position,
    userQueue: userQueue.map(minimalItem),
    time: Number.isFinite(snap.time) && snap.time > 0 ? Math.floor(snap.time * 10) / 10 : 0,
    shuffle: !!snap.shuffle,
    repeat: snap.repeat,
    context: snap.context ? { ...snap.context } : null,
  }
  return JSON.stringify(stored)
}

function isItem(v: unknown): v is JellyfinItem {
  const o = v as JellyfinItem | null
  return !!o && typeof o === 'object' && typeof o.Id === 'string' && o.Id !== '' && typeof o.Name === 'string'
}

function parseContext(v: unknown): PlaybackContext | null {
  const c = v as PlaybackContext | null
  if (!c || typeof c !== 'object' || typeof c.name !== 'string' || !CONTEXT_TYPES.includes(c.type)) return null
  return { type: c.type, name: c.name, ...(typeof c.id === 'string' ? { id: c.id } : {}) }
}

/**
 * Parses and validates a stored session. Returns null for missing, corrupt,
 * outdated or foreign (other server/user) data. Invalid tracks are dropped.
 */
export function parseSession(raw: string | null | undefined, owner: SessionOwner): PlaybackSnapshot | null {
  if (!raw) return null
  let data: Partial<StoredSession>
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object' || data.v !== SESSION_VERSION) return null
  if (data.owner?.serverUrl !== owner.serverUrl || data.owner?.userId !== owner.userId) return null
  if (!isItem(data.current)) return null

  const rawItems = Array.isArray(data.items) ? data.items : []
  const rawPos = typeof data.position === 'number' && Number.isInteger(data.position) ? data.position : -1
  // Drop invalid entries while keeping the cursor on the same track.
  const items: JellyfinItem[] = []
  let position = -1
  rawItems.slice(0, MAX_STORED_TRACKS).forEach((it, i) => {
    if (!isItem(it)) return
    if (i === rawPos) position = items.length
    items.push(it)
  })
  const userQueue = (Array.isArray(data.userQueue) ? data.userQueue : []).filter(isItem).slice(0, MAX_STORED_TRACKS)
  const time = typeof data.time === 'number' && Number.isFinite(data.time) && data.time > 0 ? data.time : 0

  return {
    current: data.current,
    items,
    position,
    userQueue,
    time,
    shuffle: data.shuffle === true,
    repeat: REPEAT_MODES.includes(data.repeat as RepeatMode) ? data.repeat as RepeatMode : 'none',
    context: parseContext(data.context),
  }
}

export function loadSession(owner: SessionOwner): PlaybackSnapshot | null {
  try {
    return parseSession(localStorage.getItem(SESSION_KEY), owner)
  } catch {
    return null
  }
}

export function saveSession(snap: PlaybackSnapshot | null, owner: SessionOwner): void {
  try {
    if (!snap) localStorage.removeItem(SESSION_KEY)
    else localStorage.setItem(SESSION_KEY, serializeSession(snap, owner))
  } catch (err) {
    console.warn('[session] failed to save playback session', err)
  }
}

interface PersistablePlayback {
  getSnapshot(): PlaybackSnapshot | null
  restoreSnapshot(snap: PlaybackSnapshot): Promise<boolean>
  on(listener: (event: string, data?: unknown) => void): () => void
}

/** Minimum time between saves triggered by playback progress. */
export const SAVE_INTERVAL_MS = 5000

/**
 * Restores the last session (paused) and keeps it saved: every few seconds
 * while playing and immediately on pause, track/queue/mode changes and unload.
 */
export function startSessionPersistence(engine: PersistablePlayback, owner: SessionOwner): () => void {
  let lastSave = 0
  let restoring = true
  const save = () => {
    if (restoring) return
    lastSave = Date.now()
    saveSession(engine.getSnapshot(), owner)
  }

  const saved = loadSession(owner)
  const restored = saved ? engine.restoreSnapshot(saved).catch(() => false) : Promise.resolve(false)
  restored.finally(() => { restoring = false })

  const off = engine.on((event) => {
    switch (event) {
      case 'timeupdate':
        if (Date.now() - lastSave >= SAVE_INTERVAL_MS) save()
        break
      case 'pause':
      case 'trackchange':
      case 'queuechange':
      case 'shufflechange':
      case 'repeatchange':
        save()
        break
    }
  })
  window.addEventListener('beforeunload', save)
  return () => {
    off()
    window.removeEventListener('beforeunload', save)
  }
}
