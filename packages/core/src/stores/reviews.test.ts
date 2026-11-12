import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useReviewsStore } from './reviews'
import * as api from '../services/reviews'

const summary = (over: Partial<api.AlbumReviews> = {}): api.AlbumReviews => ({ average: null, count: 0, mine: null, items: [], ...over })

beforeEach(() => useReviewsStore.setState({ byAlbum: {} }))

describe('reviews store', () => {
  it('loads, saves and removes, reloading the album summary', async () => {
    vi.spyOn(api, 'getAlbumReviews').mockResolvedValueOnce(summary()).mockResolvedValueOnce(summary({ count: 1, average: 8 })).mockResolvedValueOnce(summary())
    const save = vi.spyOn(api, 'saveReview').mockResolvedValue({} as api.Review)
    const del = vi.spyOn(api, 'deleteReview').mockResolvedValue()
    const s = useReviewsStore.getState()
    await s.load('a1')
    expect(useReviewsStore.getState().byAlbum.a1).toEqual(summary())
    await s.save('a1', { rating: 8 })
    expect(save).toHaveBeenCalledWith('a1', { rating: 8 })
    expect(useReviewsStore.getState().byAlbum.a1.count).toBe(1)
    await s.remove('a1')
    expect(del).toHaveBeenCalledWith('a1')
    expect(useReviewsStore.getState().byAlbum.a1.count).toBe(0)
  })

  it('removes another user review as admin', async () => {
    vi.spyOn(api, 'getAlbumReviews').mockResolvedValue(summary())
    const del = vi.spyOn(api, 'adminDeleteReview').mockResolvedValue()
    await useReviewsStore.getState().remove('a1', 'bia')
    expect(del).toHaveBeenCalledWith('a1', 'bia')
  })
})
