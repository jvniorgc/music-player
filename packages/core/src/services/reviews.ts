import { socialRequest, type SocialUser } from './social'

/** Ratings are stored as integers 1–10 (half stars); 7 → 3.5 stars. */
export interface Review {
  albumId: string
  user: SocialUser
  rating: number
  body: string | null
  albumName: string | null
  albumArtist: string | null
  createdAt: string
  updatedAt: string
}

export interface AlbumReviews {
  average: number | null
  count: number
  mine: Review | null
  items: Review[]
}

export interface TopAlbum {
  albumId: string
  albumName: string | null
  albumArtist: string | null
  average: number
  count: number
}

export interface ReviewInput {
  rating: number
  body?: string
  albumName?: string
  albumArtist?: string
}

export type RatingSummary = Record<string, { average: number; count: number }>

export const MAX_REVIEW_BODY = 2000

export const toStars = (rating: number) => rating / 2
export const formatAverage = (average: number) => (average / 2).toFixed(1)

const album = (id: string) => `/albums/${encodeURIComponent(id)}`

export function getAlbumReviews(albumId: string): Promise<AlbumReviews> {
  return socialRequest<AlbumReviews>(`${album(albumId)}/reviews`)
}

export function saveReview(albumId: string, input: ReviewInput): Promise<Review> {
  return socialRequest<Review>(`${album(albumId)}/review`, { method: 'PUT', body: JSON.stringify(input) })
}

export function deleteReview(albumId: string): Promise<void> {
  return socialRequest<void>(`${album(albumId)}/review`, { method: 'DELETE' })
}

export function adminDeleteReview(albumId: string, userId: string): Promise<void> {
  return socialRequest<void>(`${album(albumId)}/reviews/${encodeURIComponent(userId)}`, { method: 'DELETE' })
}

export async function recentReviews(limit = 30): Promise<Review[]> {
  return (await socialRequest<{ items: Review[] }>(`/reviews/recent?limit=${limit}`)).items
}

export async function topRated(minCount = 2): Promise<TopAlbum[]> {
  return (await socialRequest<{ items: TopAlbum[] }>(`/reviews/top?minCount=${minCount}`)).items
}

export async function userReviews(userId: string): Promise<Review[]> {
  return (await socialRequest<{ items: Review[] }>(`/users/${encodeURIComponent(userId)}/reviews`)).items
}

export async function batchRatings(ids: string[]): Promise<RatingSummary> {
  if (!ids.length) return {}
  return socialRequest<RatingSummary>('/albums/ratings', { method: 'POST', body: JSON.stringify({ ids }) })
}
