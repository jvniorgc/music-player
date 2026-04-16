const SLSKD_DEFAULT_PORT = '5030'
const SLSKD_DEFAULT_USER = 'slskd'
const SLSKD_DEFAULT_PASS = 'slskd'

let slskdUrl = ''
let slskdUser = SLSKD_DEFAULT_USER
let slskdPass = SLSKD_DEFAULT_PASS
let token: string | null = null

export interface SlskdConfig {
  url: string
  username: string
  password: string
}

export function configure(config: SlskdConfig): void {
  slskdUrl = config.url.replace(/\/+$/, '')
  slskdUser = config.username
  slskdPass = config.password
  token = null // force re-auth
}

export function getConfig(): SlskdConfig {
  return { url: slskdUrl, username: slskdUser, password: slskdPass }
}

/** Derive default slskd URL from a Jellyfin server URL */
export function deriveDefaultUrl(jellyfinUrl: string): string {
  try {
    const u = new URL(jellyfinUrl)
    return `${u.protocol}//${u.hostname}:${SLSKD_DEFAULT_PORT}`
  } catch {
    return ''
  }
}

export function isConfigured(): boolean {
  return slskdUrl.length > 0
}

export interface SlskdFile {
  filename: string
  size: number
  bitRate?: number
  sampleRate?: number
  bitDepth?: number
  length?: number
  extension?: string
  code?: number
}

export interface SlskdResponse {
  username: string
  fileCount: number
  lockedFileCount: number
  hasFreeUploadSlot: boolean
  uploadSpeed: number
  queueLength: number
  files: SlskdFile[]
  lockedFiles: SlskdFile[]
}

export interface SlskdSearch {
  id: string
  searchText: string
  state: string
  responseCount: number
  fileCount: number
  isComplete: boolean
}

export interface SlskdTransferFile {
  id: string
  filename: string
  size: number
  state: string
  percentComplete: number
  averageSpeed: number
  bytesTransferred: number
  bytesRemaining: number
  elapsedTime?: string
  remainingTime?: string
  exception?: string
}

export interface SlskdTransferDir {
  directory: string
  fileCount: number
  files: SlskdTransferFile[]
}

export interface SlskdTransferGroup {
  username: string
  directories: SlskdTransferDir[]
}

async function authenticate(): Promise<string> {
  if (!slskdUrl) throw new Error('slskd não configurado')
  const res = await fetch(`${slskdUrl}/api/v0/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: slskdUser, password: slskdPass })
  })
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`)
  const data = await res.json()
  token = data.token
  return token!
}

async function getToken(): Promise<string> {
  if (token) return token
  return authenticate()
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  if (!slskdUrl) throw new Error('slskd não configurado')
  let tok = await getToken()

  let res = await fetch(`${slskdUrl}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${tok}`,
      'Content-Type': 'application/json',
      ...options?.headers
    }
  })

  // Re-auth on 401
  if (res.status === 401) {
    tok = await authenticate()
    res = await fetch(`${slskdUrl}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${tok}`,
        'Content-Type': 'application/json',
        ...options?.headers
      }
    })
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`slskd API error: ${res.status} - ${body}`)
  }

  if (res.status === 204) return undefined as T
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text)
}

export async function startSearch(searchText: string): Promise<SlskdSearch> {
  const id = crypto.randomUUID()
  return request<SlskdSearch>('/api/v0/searches', {
    method: 'POST',
    body: JSON.stringify({ id, searchText })
  })
}

export async function getSearch(searchId: string): Promise<SlskdSearch> {
  return request<SlskdSearch>(`/api/v0/searches/${searchId}`)
}

export async function getSearchResponses(searchId: string): Promise<SlskdResponse[]> {
  return request<SlskdResponse[]>(`/api/v0/searches/${searchId}/responses`)
}

export async function deleteSearch(searchId: string): Promise<void> {
  return request<void>(`/api/v0/searches/${searchId}`, { method: 'DELETE' })
}

export async function downloadFiles(username: string, files: { filename: string; size: number }[]): Promise<void> {
  return request<void>(`/api/v0/transfers/downloads/${encodeURIComponent(username)}`, {
    method: 'POST',
    body: JSON.stringify(files)
  })
}

export async function getDownloads(): Promise<SlskdTransferGroup[]> {
  return request<SlskdTransferGroup[]>('/api/v0/transfers/downloads')
}

export async function getApplicationInfo(): Promise<{ server: { isConnected: boolean; isLoggedIn: boolean } }> {
  return request('/api/v0/application')
}

// Helpers
export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || ''
}

export function getFileName(filepath: string): string {
  return filepath.split(/[/\\]/).pop() || filepath
}

export function getDirectory(filepath: string): string {
  const parts = filepath.split(/[/\\]/)
  parts.pop()
  return parts.join('/')
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
}

export function formatDuration(seconds?: number): string {
  if (!seconds) return ''
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function isAudioFile(filename: string): boolean {
  const ext = getFileExtension(filename)
  return ['flac', 'mp3', 'ogg', 'opus', 'wav', 'aac', 'm4a', 'wma', 'ape', 'alac'].includes(ext)
}

/** Group files by directory for folder-based downloading */
export function groupFilesByDirectory(files: SlskdFile[]): Map<string, SlskdFile[]> {
  const map = new Map<string, SlskdFile[]>()
  for (const f of files) {
    const dir = getDirectory(f.filename)
    if (!map.has(dir)) map.set(dir, [])
    map.get(dir)!.push(f)
  }
  return map
}
