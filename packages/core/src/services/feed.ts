import { socialRequest, isConfigured } from './social'
import { getDownloads } from './slskd'
import { formatDate, useI18nStore, type Locale } from '../i18n'

export interface FeedActor { id: string; name: string }
export interface SoulseekAlbum { albumName?: string; artist?: string; folder: string }
export interface LibraryAlbum { id: string; name: string; artist: string | null }

export type FeedItem =
  | { type: 'soulseek_download'; id: string; time: string; actor: FeedActor; count: number; files: number; albums: SoulseekAlbum[] }
  | { type: 'request_fulfilled'; id: string; time: string; actor: FeedActor; title: string; artist: string; coverUrl: string | null }
  | { type: 'library_added'; id: string; time: string; albums: LibraryAlbum[] }

export interface FeedPage { items: FeedItem[]; nextBefore: string | null }

export type FeedEvent = { type: 'soulseek_download'; files: number; folder: string; albumName?: string; artist?: string }

export function getFeed(opts: { before?: string; limit?: number } = {}): Promise<FeedPage> {
  const params = new URLSearchParams({ limit: String(opts.limit ?? 30) })
  if (opts.before) params.set('before', opts.before)
  return socialRequest<FeedPage>(`/feed?${params}`)
}

/** Fire-and-forget: report an event to the social server when one is configured. */
export function reportEvent(event: FeedEvent): void {
  if (!isConfigured()) return
  socialRequest('/events', { method: 'POST', body: JSON.stringify(event) }).catch(() => {})
}

/** Derives a display folder (and best-effort artist/album) from a remote Soulseek file path. */
export function parseFolder(filename: string): SoulseekAlbum {
  const parts = filename.split(/[/\\]/).filter(Boolean)
  if (parts.length < 2) return { folder: parts[0] ?? filename }
  const folder = parts[parts.length - 2]
  const dash = folder.match(/^(.+?)\s+-\s+(.+)$/)
  if (dash) return { folder, artist: dash[1], albumName: dash[2] }
  const parent = parts.length >= 3 ? parts[parts.length - 3] : undefined
  return parent ? { folder, artist: parent, albumName: folder } : { folder, albumName: folder }
}

export const POLL_MS = 10_000
export const MAX_MISSES = 6

interface Watch { username: string; filenames: Set<string>; misses: number }
const watches: Watch[] = []
let timer: ReturnType<typeof setInterval> | null = null

/** Indirection so tests can observe reports. */
export const internals = { report: reportEvent }

export function stopWatching(): void {
  watches.length = 0
  if (timer) clearInterval(timer)
  timer = null
}

async function tick(): Promise<void> {
  let groups
  try {
    groups = await getDownloads()
  } catch {
    return
  }
  for (const w of [...watches]) {
    const files = groups.filter(g => g.username === w.username)
      .flatMap(g => g.directories.flatMap(d => d.files))
      .filter(f => w.filenames.has(f.filename))
    if (files.length === 0) {
      if (++w.misses >= MAX_MISSES) watches.splice(watches.indexOf(w), 1)
      continue
    }
    if (!files.every(f => f.state.includes('Completed'))) continue
    watches.splice(watches.indexOf(w), 1)
    const ok = files.filter(f => f.state.includes('Succeeded')).length
    if (ok > 0) internals.report({ type: 'soulseek_download', files: ok, ...parseFolder(files[0].filename) })
  }
  if (watches.length === 0) stopWatching()
}

/** Watches queued slskd downloads in the background and reports them to the feed once finished. */
export function watchSoulseekDownload(username: string, filenames: string[]): void {
  if (filenames.length === 0) return
  watches.push({ username, filenames: new Set(filenames), misses: 0 })
  timer ??= setInterval(() => { void tick() }, POLL_MS)
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [['day', 86_400_000], ['hour', 3_600_000], ['minute', 60_000]]

/** "5 minutes ago" for the last week, a locale date otherwise. */
export function formatRelative(iso: string, now = Date.now(), locale: Locale = useI18nStore.getState().locale): string {
  const diff = now - new Date(iso).getTime()
  if (diff >= 7 * 86_400_000) return formatDate(iso, { dateStyle: 'medium' }, locale)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  for (const [unit, ms] of UNITS) {
    if (diff >= ms) return rtf.format(-Math.floor(diff / ms), unit)
  }
  return rtf.format(0, 'second')
}
