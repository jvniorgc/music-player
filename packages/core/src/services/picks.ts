import { socialRequest, type SocialUser } from './social'

export interface AlbumPick {
  weekStart: string
  user: SocialUser
  albumId: string
  albumName: string
  artist: string
  year: string | null
  note: string | null
  createdAt: string
  updatedAt: string
}

export interface PicksWeek { weekStart: string; expiresAt: string; items: AlbumPick[]; mine: AlbumPick | null }

export interface NewPick { albumId: string; albumName: string; artist: string; year?: string; note?: string }

export const MAX_PICK_NOTE = 280

export function getCurrentPicks(): Promise<PicksWeek> {
  return socialRequest<PicksWeek>('/picks/current')
}

export function setMyPick(pick: NewPick): Promise<AlbumPick> {
  return socialRequest<AlbumPick>('/picks/current', { method: 'PUT', body: JSON.stringify(pick) })
}

export function deleteMyPick(): Promise<void> {
  return socialRequest<void>('/picks/current', { method: 'DELETE' })
}

export async function getPicksHistory(weeks = 8): Promise<{ weekStart: string; items: AlbumPick[] }[]> {
  return (await socialRequest<{ weeks: { weekStart: string; items: AlbumPick[] }[] }>(`/picks/history?weeks=${weeks}`)).weeks
}

/** Whole days until the week's picks expire (at least 1 while the week is running). */
export function daysLeft(expiresAt: string, now = new Date()): number {
  return Math.max(1, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 86_400_000))
}
