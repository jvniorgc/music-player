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
