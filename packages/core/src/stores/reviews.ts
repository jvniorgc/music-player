import { create } from 'zustand'
import { getAlbumReviews, saveReview, deleteReview, adminDeleteReview, type AlbumReviews, type ReviewInput } from '../services/reviews'

interface ReviewsState {
  byAlbum: Record<string, AlbumReviews>
  load: (albumId: string) => Promise<void>
  save: (albumId: string, input: ReviewInput) => Promise<void>
  /** Delete your own review, or (admins) another user's when `userId` is given. */
  remove: (albumId: string, userId?: string) => Promise<void>
}

export const useReviewsStore = create<ReviewsState>((set, get) => ({
  byAlbum: {},

  load: async (albumId) => {
    const data = await getAlbumReviews(albumId)
    set(s => ({ byAlbum: { ...s.byAlbum, [albumId]: data } }))
  },

  save: async (albumId, input) => {
    await saveReview(albumId, input)
    await get().load(albumId)
  },

  remove: async (albumId, userId) => {
    await (userId ? adminDeleteReview(albumId, userId) : deleteReview(albumId))
    await get().load(albumId)
  },
}))
