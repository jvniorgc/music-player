import { resolve, sep, isAbsolute } from 'path'

/** True for well-formed http(s) URLs only. */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 8192) return false
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** URLs we are willing to hand to the OS via shell.openExternal. */
export function isSafeExternalUrl(value: unknown): value is string {
  if (isHttpUrl(value)) return true
  if (typeof value !== 'string') return false
  try {
    return new URL(value).protocol === 'mailto:'
  } catch {
    return false
  }
}

/** Jellyfin item ids / cache keys used in file names: restrict to a safe charset. */
export function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value)
}

/**
 * Resolve `candidate` and return it only if it lies strictly inside one of
 * `roots` (after normalisation, so `..` traversal is rejected). Null otherwise.
 */
export function resolveInside(candidate: unknown, roots: string[]): string | null {
  if (typeof candidate !== 'string' || !candidate || candidate.includes('\0')) return null
  if (!isAbsolute(candidate)) return null
  const full = resolve(candidate)
  for (const root of roots) {
    if (!root) continue
    const r = resolve(root)
    if (full.startsWith(r + sep)) return full
  }
  return null
}

/** Origin (`scheme://host[:port]`) of an http(s) URL, or null. */
export function originOf(value: unknown): string | null {
  if (!isHttpUrl(value)) return null
  return new URL(value).origin
}

/** Third-party APIs the renderer calls directly (CORS may be missing on redirects). */
const PUBLIC_API_HOSTS = ['musicbrainz.org', 'coverartarchive.org', 'archive.org', 'lrclib.net', 'theaudiodb.com', 'wikidata.org', 'wikimedia.org']

/**
 * Whether the main process may add permissive CORS headers to a response from
 * `url`: only the user's configured servers (Jellyfin/slskd) and the fixed
 * public metadata APIs (and their subdomains).
 */
export function isCorsAllowed(url: string, allowedOrigins: Iterable<string>): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  for (const o of allowedOrigins) if (o === u.origin) return true
  if (u.protocol !== 'https:') return false
  return PUBLIC_API_HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h))
}

/** Build a local-audio:// URL for an absolute path (decoded by the protocol handler). */
export function toLocalAudioUrl(filePath: string): string {
  return `local-audio://${encodeURIComponent(filePath)}`
}
