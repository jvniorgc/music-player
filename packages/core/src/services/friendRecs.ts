import { socialRequest, type SocialUser } from './social'
import type { JellyfinItem } from './jellyfin'

export type RecItemType = 'track' | 'album' | 'artist'
export type Reaction = 'like' | 'love'

export interface RecItem {
  type: RecItemType
  id: string
  name: string
  artist?: string | null
  albumId?: string | null
}

export interface FriendRec {
  id: number
  from: SocialUser
  toUserId: string
  toUserName: string
  item: RecItem
  message: string | null
  createdAt: string
  listenedAt: string | null
  reaction: Reaction | null
}

export const MAX_REC_MESSAGE = 280

export async function sendRecommendation(toUserIds: string[], item: RecItem, message?: string): Promise<FriendRec[]> {
  const body = message ? { toUserIds, item, message } : { toUserIds, item }
  return (await socialRequest<{ items: FriendRec[] }>('/recommendations', { method: 'POST', body: JSON.stringify(body) })).items
}

export async function getInbox(unreadOnly = false): Promise<FriendRec[]> {
  return (await socialRequest<{ items: FriendRec[] }>(`/recommendations/inbox${unreadOnly ? '?unread=1' : ''}`)).items
}

export async function getSent(): Promise<FriendRec[]> {
  return (await socialRequest<{ items: FriendRec[] }>('/recommendations/sent')).items
}

export async function getUnreadCount(): Promise<number> {
  return (await socialRequest<{ count: number }>('/recommendations/unread-count')).count
}

export function markListened(id: number): Promise<FriendRec> {
  return socialRequest<FriendRec>(`/recommendations/${id}/listened`, { method: 'POST' })
}

export function setReaction(id: number, reaction: Reaction | null): Promise<FriendRec> {
  return socialRequest<FriendRec>(`/recommendations/${id}/reaction`, { method: 'POST', body: JSON.stringify({ reaction }) })
}

export function deleteRecommendation(id: number): Promise<void> {
  return socialRequest<void>(`/recommendations/${id}`, { method: 'DELETE' })
}

/** Snapshot of a Jellyfin track/album/artist to send. */
export function itemFromJellyfin(item: JellyfinItem): RecItem {
  if (item.Type === 'MusicArtist') return { type: 'artist', id: item.Id, name: item.Name }
  if (item.Type === 'MusicAlbum') {
    return { type: 'album', id: item.Id, name: item.Name, ...(item.AlbumArtist && { artist: item.AlbumArtist }), albumId: item.Id }
  }
  const artist = item.Artists?.[0] ?? item.AlbumArtist
  return { type: 'track', id: item.Id, name: item.Name, ...(artist && { artist }), ...(item.AlbumId && { albumId: item.AlbumId }) }
}

/** Whether playing `track` counts as listening to `rec` (the track itself, or any track of the album). */
export function matchesTrack(rec: FriendRec, track: Pick<JellyfinItem, 'Id' | 'AlbumId'>): boolean {
  if (rec.item.type === 'track') return rec.item.id === track.Id
  if (rec.item.type === 'album') return rec.item.id === track.AlbumId
  return false
}
