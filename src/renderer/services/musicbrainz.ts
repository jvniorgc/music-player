const MB_BASE = 'https://musicbrainz.org/ws/2'
const CAA_BASE = 'https://coverartarchive.org'
const USER_AGENT = 'JellyfinMusicPlayer/0.1.0 (https://github.com/jvniorgc/music-player)'

export interface MBRelease {
  id: string
  title: string
  date?: string
  country?: string
  status?: string
  'artist-credit'?: { name: string; artist: { id: string; name: string } }[]
  'release-group'?: { id: string; title: string; 'primary-type'?: string }
  'label-info'?: { 'catalog-number'?: string; label?: { name: string } }[]
  media?: MBMedia[]
  'text-representation'?: { language: string; script: string }
  tags?: { name: string; count: number }[]
}

export interface MBMedia {
  position: number
  format?: string
  'track-count': number
  tracks?: MBTrack[]
}

export interface MBTrack {
  id: string
  number: string
  title: string
  position: number
  length?: number
  recording: { id: string; title: string; length?: number }
}

export interface MBSearchResult {
  releases: MBRelease[]
  count: number
}

async function mbFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${MB_BASE}${path}`, {
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' }
  })
  if (!res.ok) throw new Error(`MusicBrainz error: ${res.status}`)
  return res.json()
}

export async function searchReleases(album: string, artist?: string, limit = 15): Promise<MBRelease[]> {
  let query = `release:"${album}"`
  if (artist) query += ` AND artist:"${artist}"`
  const data = await mbFetch<MBSearchResult>(
    `/release?query=${encodeURIComponent(query)}&limit=${limit}&fmt=json`
  )
  return data.releases || []
}

export async function getReleaseDetails(releaseId: string): Promise<MBRelease> {
  return mbFetch<MBRelease>(
    `/release/${releaseId}?inc=recordings+artists+labels+release-groups+tags&fmt=json`
  )
}

export function getCoverArtUrl(releaseId: string, size: 250 | 500 | 1200 = 500): string {
  return `${CAA_BASE}/release/${releaseId}/front-${size}`
}

export async function hasCoverArt(releaseId: string): Promise<boolean> {
  try {
    const res = await fetch(`${CAA_BASE}/release/${releaseId}`, { method: 'HEAD' })
    return res.ok
  } catch {
    return false
  }
}

export function formatMBDate(date?: string): string {
  if (!date) return ''
  return date.split('-')[0] // Just the year
}

export function getArtistName(release: MBRelease): string {
  return release['artist-credit']?.map(ac => ac.name).join('') || ''
}

export function getLabel(release: MBRelease): string {
  const info = release['label-info']?.[0]
  return info?.label?.name || ''
}

export function getCatalogNumber(release: MBRelease): string {
  const info = release['label-info']?.[0]
  return info?.['catalog-number'] || ''
}

// --- Artist search ---

export interface MBArtist {
  id: string
  name: string
  'sort-name'?: string
  disambiguation?: string
  type?: string
  country?: string
  'life-span'?: { begin?: string; end?: string; ended?: boolean }
  tags?: { name: string; count: number }[]
  relations?: MBRelation[]
}

export interface MBRelation {
  type: string
  url?: { resource: string }
}

export interface MBArtistSearchResult {
  artists: MBArtist[]
  count: number
}

export async function searchArtists(name: string, limit = 15): Promise<MBArtist[]> {
  const query = `artist:"${name}"`
  const data = await mbFetch<MBArtistSearchResult>(
    `/artist?query=${encodeURIComponent(query)}&limit=${limit}&fmt=json`
  )
  return data.artists || []
}

export async function getArtistDetails(artistId: string): Promise<MBArtist> {
  return mbFetch<MBArtist>(
    `/artist/${artistId}?inc=url-rels+tags&fmt=json`
  )
}

/**
 * Try to get an artist image URL from TheAudioDB (free API) using MusicBrainz ID.
 * Returns the thumbnail URL or null if not found.
 */
export async function getArtistImageUrl(mbid: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.theaudiodb.com/api/v1/json/2/artist-mb.php?i=${mbid}`,
      { headers: { 'User-Agent': USER_AGENT } }
    )
    if (!res.ok) return null
    const data = await res.json()
    const artist = data?.artists?.[0]
    if (!artist) return null
    return artist.strArtistThumb || artist.strArtistFanart || artist.strArtistWideThumb || null
  } catch {
    return null
  }
}

/**
 * Fallback: extract image URL from MusicBrainz artist relations (Wikidata/Wikipedia).
 * Tries to find an image via Wikidata.
 */
export async function getArtistImageFromWikidata(artist: MBArtist): Promise<string | null> {
  if (!artist.relations) return null
  const wikidataRel = artist.relations.find(
    r => r.type === 'wikidata' && r.url?.resource
  )
  if (!wikidataRel?.url?.resource) return null

  try {
    const entityId = wikidataRel.url.resource.split('/').pop()
    const res = await fetch(
      `https://www.wikidata.org/wiki/Special:EntityData/${entityId}.json`
    )
    if (!res.ok) return null
    const data = await res.json()
    const entity = data.entities?.[entityId!]
    const imageClaim = entity?.claims?.P18?.[0]?.mainsnak?.datavalue?.value
    if (!imageClaim) return null
    const filename = imageClaim.replace(/ /g, '_')
    const md5 = await computeMd5ForWikimedia(filename)
    return `https://upload.wikimedia.org/wikipedia/commons/thumb/${md5[0]}/${md5.slice(0, 2)}/${filename}/500px-${filename}`
  } catch {
    return null
  }
}

/** Simple hash for Wikimedia file path */
async function computeMd5ForWikimedia(filename: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(filename)
  const hash = await crypto.subtle.digest('MD5', data).catch(() => null)
  if (hash) {
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
  }
  // Fallback: simple hash approximation (MD5 not always available in all contexts)
  let h = 0
  for (let i = 0; i < filename.length; i++) {
    h = ((h << 5) - h + filename.charCodeAt(i)) | 0
  }
  return Math.abs(h).toString(16).padStart(32, '0')
}
