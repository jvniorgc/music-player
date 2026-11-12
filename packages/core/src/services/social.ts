import { timeoutSignal } from './http'
import { jellyfin } from './jellyfin'

const SOCIAL_SUBPATH = '/mp-api'
const SETTING_KEY = 'socialServerUrl'

let socialUrl = ''

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'fulfilled'

export interface SocialUser { id: string; name: string }

export interface AlbumRequest {
  id: number
  title: string
  artist: string
  year: string | null
  mbReleaseId: string | null
  coverUrl: string | null
  note: string | null
  status: RequestStatus
  adminNote: string | null
  requestedBy: SocialUser
  createdAt: string
  updatedAt: string
  votes: number
  votedByMe: boolean
  voters: SocialUser[]
}

export interface Me extends SocialUser { isAdmin: boolean }

export interface KnownUser extends SocialUser { lastSeen: string }

export interface NewAlbumRequest {
  title: string
  artist: string
  year?: string
  mbReleaseId?: string
  coverUrl?: string
  note?: string
}

export class SocialApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'SocialApiError'
  }
}

export class DuplicateRequestError extends SocialApiError {
  constructor(public request: AlbumRequest) {
    super(409, 'duplicate')
    this.name = 'DuplicateRequestError'
  }
}

export function configure(url: string): void {
  socialUrl = url.trim().replace(/\/+$/, '')
  window.api?.setSetting?.(SETTING_KEY, socialUrl)?.catch(() => {})
  allow()
}

function allow(): void {
  if (socialUrl) {
    window.api?.allowOrigin?.(socialUrl)?.catch(err => console.warn('[social] could not allow origin', err))
  }
}

/** Restore the persisted social server URL (keeps the current one if none saved). */
export async function loadConfig(): Promise<void> {
  const saved = await window.api.getSetting(SETTING_KEY).catch(() => null)
  if (saved) {
    socialUrl = saved
    allow()
  }
}

export function getConfig(): { url: string } {
  return { url: socialUrl }
}

export function isConfigured(): boolean {
  return socialUrl.length > 0
}

/** Default social server URL: the `/mp-api` subpath reverse-proxied on the Jellyfin domain. */
export function deriveDefaultUrl(jellyfinUrl: string): string {
  try {
    const u = new URL(jellyfinUrl)
    return `${u.origin}${u.pathname.replace(/\/+$/, '')}${SOCIAL_SUBPATH}`
  } catch {
    return ''
  }
}

/** If no URL is configured, probe `{jellyfinUrl}/mp-api/health` and adopt it when it answers. */
export async function autoDetect(jellyfinUrl: string): Promise<boolean> {
  if (socialUrl) return false
  const url = deriveDefaultUrl(jellyfinUrl)
  if (!url || !(await testConnection(url))) return false
  configure(url)
  return true
}

export async function testConnection(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url.trim().replace(/\/+$/, '')}/health`, { signal: timeoutSignal(undefined, 10_000) })
    // Jellyfin also answers /health ("Healthy"), so require the API's JSON shape.
    if (!res.ok) return false
    const data = await res.json().catch(() => null)
    return data?.ok === true
  } catch {
    return false
  }
}

/** Authenticated JSON call to the social API; feature clients build on this. */
export async function socialRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!socialUrl) throw new Error('Social server not configured')
  const res = await fetch(`${socialUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `MediaBrowser Token="${jellyfin.token}"`,
      'Content-Type': 'application/json',
    },
    signal: timeoutSignal(),
  })
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)
  if (res.status === 409 && data?.request) throw new DuplicateRequestError(data.request)
  if (!res.ok) throw new SocialApiError(res.status, data?.error || `Social server error: ${res.status}`)
  return data as T
}

export function getMe(): Promise<Me> {
  return socialRequest<Me>('/me')
}

export async function listRequests(status?: RequestStatus): Promise<AlbumRequest[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : ''
  return (await socialRequest<{ items: AlbumRequest[] }>(`/requests${q}`)).items
}

export function createRequest(body: NewAlbumRequest): Promise<AlbumRequest> {
  return socialRequest<AlbumRequest>('/requests', { method: 'POST', body: JSON.stringify(body) })
}

export function vote(id: number): Promise<AlbumRequest> {
  return socialRequest<AlbumRequest>(`/requests/${id}/vote`, { method: 'POST' })
}

export function unvote(id: number): Promise<AlbumRequest> {
  return socialRequest<AlbumRequest>(`/requests/${id}/vote`, { method: 'DELETE' })
}

export function updateRequest(id: number, body: { status: RequestStatus; adminNote?: string }): Promise<AlbumRequest> {
  return socialRequest<AlbumRequest>(`/requests/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function deleteRequest(id: number): Promise<void> {
  return socialRequest<void>(`/requests/${id}`, { method: 'DELETE' })
}

/** Everyone who has used the social server (friends you can recommend to, etc.). */
export async function listUsers(): Promise<KnownUser[]> {
  return (await socialRequest<{ items: KnownUser[] }>('/users')).items
}
