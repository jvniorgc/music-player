import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as reviews from './reviews'
import * as social from './social'
import { jellyfin } from './jellyfin'
import { jsonRes, emptyRes, mockFetchRouter } from '@test/http'

beforeEach(() => {
  window.api.allowOrigin = vi.fn().mockResolvedValue(undefined)
  jellyfin.setAuth({ serverUrl: 'http://jf:8096', token: 'tok', userId: 'u1', username: 'ana', serverId: 's' } as never)
  social.configure('http://social:8099')
})

const calls = () => vi.mocked(fetch).mock.calls.map(([url, init]) => [String(url), init?.method ?? 'GET', init?.body])

describe('reviews service', () => {
  it('calls every endpoint', async () => {
    const summary = { average: 8, count: 1, mine: null, items: [] }
    mockFetchRouter([
      ['/albums/a%201/reviews', jsonRes(summary)],
      ['/albums/a1/reviews/bia', emptyRes(204)],
      ['/albums/a1/review', jsonRes({ rating: 8 })],
      ['/reviews/recent', jsonRes({ items: [1] })],
      ['/reviews/top', jsonRes({ items: [2] })],
      ['/users/u1/reviews', jsonRes({ items: [3] })],
      ['/albums/ratings', jsonRes({ a1: { average: 8, count: 1 } })],
    ])
    expect(await reviews.getAlbumReviews('a 1')).toEqual(summary)
    expect(await reviews.saveReview('a1', { rating: 8, body: 'x' })).toEqual({ rating: 8 })
    await reviews.adminDeleteReview('a1', 'bia')
    expect(await reviews.recentReviews(5)).toEqual([1])
    expect(await reviews.topRated(3)).toEqual([2])
    expect(await reviews.userReviews('u1')).toEqual([3])
    expect(await reviews.batchRatings(['a1'])).toEqual({ a1: { average: 8, count: 1 } })
    expect(calls()).toEqual([
      ['http://social:8099/albums/a%201/reviews', 'GET', undefined],
      ['http://social:8099/albums/a1/review', 'PUT', JSON.stringify({ rating: 8, body: 'x' })],
      ['http://social:8099/albums/a1/reviews/bia', 'DELETE', undefined],
      ['http://social:8099/reviews/recent?limit=5', 'GET', undefined],
      ['http://social:8099/reviews/top?minCount=3', 'GET', undefined],
      ['http://social:8099/users/u1/reviews', 'GET', undefined],
      ['http://social:8099/albums/ratings', 'POST', JSON.stringify({ ids: ['a1'] })],
    ])
  })

  it('deletes own review, uses defaults and skips empty batches', async () => {
    mockFetchRouter([
      ['/albums/a1/review', emptyRes(204)],
      ['/reviews/recent', jsonRes({ items: [] })],
      ['/reviews/top', jsonRes({ items: [] })],
    ])
    await reviews.deleteReview('a1')
    await reviews.recentReviews()
    await reviews.topRated()
    expect(await reviews.batchRatings([])).toEqual({})
    expect(calls().map(c => c[0])).toEqual([
      'http://social:8099/albums/a1/review', 'http://social:8099/reviews/recent?limit=30', 'http://social:8099/reviews/top?minCount=2',
    ])
  })

  it('converts between ratings and stars', () => {
    expect(reviews.toStars(7)).toBe(3.5)
    expect(reviews.formatAverage(7.333)).toBe('3.7')
  })
})
