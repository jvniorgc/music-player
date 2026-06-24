import { describe, it, expect, vi } from 'vitest'
import {
  toScrobbleMeta,
  shouldScrobble,
  nowPlaying,
  scrobble,
  getStatus,
  setCredentials,
  setEnabled,
  startAuth,
  finishAuth,
  disconnect,
} from './lastfm'
import type { JellyfinItem } from './jellyfin'

function makeItem(overrides: Partial<JellyfinItem> = {}): JellyfinItem {
  return {
    Id: 'song-1',
    Name: 'Song Title',
    Type: 'Audio',
    Artists: ['The Artist'],
    AlbumArtist: 'Album Artist',
    Album: 'The Album',
    RunTimeTicks: 200 * 10_000_000, // 200s
    ...overrides,
  }
}

describe('toScrobbleMeta', () => {
  it('maps a Jellyfin item to Last.fm metadata', () => {
    expect(toScrobbleMeta(makeItem())).toEqual({
      artist: 'The Artist',
      track: 'Song Title',
      album: 'The Album',
      albumArtist: 'Album Artist',
      duration: 200,
    })
  })

  it('falls back to AlbumArtist when Artists is missing', () => {
    const meta = toScrobbleMeta(makeItem({ Artists: undefined }))
    expect(meta?.artist).toBe('Album Artist')
  })

  it('omits optional fields when absent', () => {
    const meta = toScrobbleMeta(makeItem({ Album: undefined, AlbumArtist: undefined, RunTimeTicks: undefined }))
    expect(meta).toEqual({ artist: 'The Artist', track: 'Song Title' })
  })

  it('returns null when there is no resolvable artist', () => {
    expect(toScrobbleMeta(makeItem({ Artists: undefined, AlbumArtist: undefined }))).toBeNull()
  })

  it('returns null when there is no track name', () => {
    expect(toScrobbleMeta(makeItem({ Name: '' }))).toBeNull()
  })
})

describe('shouldScrobble', () => {
  it('rejects tracks shorter than 30s', () => {
    expect(shouldScrobble(20, 25)).toBe(false)
  })

  it('accepts when played at least half the duration', () => {
    expect(shouldScrobble(100, 200)).toBe(true)
    expect(shouldScrobble(99, 200)).toBe(false)
  })

  it('accepts when played at least 4 minutes regardless of duration', () => {
    expect(shouldScrobble(240, 1000)).toBe(true)
  })
})

describe('nowPlaying', () => {
  it('forwards mapped metadata to the platform bridge', async () => {
    await nowPlaying(makeItem())
    expect(window.api.lastfmNowPlaying).toHaveBeenCalledWith({
      artist: 'The Artist',
      track: 'Song Title',
      album: 'The Album',
      albumArtist: 'Album Artist',
      duration: 200,
    })
  })

  it('does nothing when the item has no usable metadata', async () => {
    await nowPlaying(makeItem({ Artists: undefined, AlbumArtist: undefined }))
    expect(window.api.lastfmNowPlaying).not.toHaveBeenCalled()
  })
})

describe('scrobble', () => {
  it('forwards metadata plus the start timestamp', async () => {
    await scrobble(makeItem(), 1700000000)
    expect(window.api.lastfmScrobble).toHaveBeenCalledWith({
      artist: 'The Artist',
      track: 'Song Title',
      album: 'The Album',
      albumArtist: 'Album Artist',
      duration: 200,
      timestamp: 1700000000,
    })
  })

  it('does nothing when the item has no usable metadata', async () => {
    await scrobble(makeItem({ Name: '' }), 1700000000)
    expect(window.api.lastfmScrobble).not.toHaveBeenCalled()
  })
})

describe('status and auth passthroughs', () => {
  it('delegates to the platform bridge', async () => {
    await getStatus()
    expect(window.api.lastfmGetStatus).toHaveBeenCalled()

    await setCredentials('key', 'secret')
    expect(window.api.lastfmSetCredentials).toHaveBeenCalledWith('key', 'secret')

    await setEnabled(true)
    expect(window.api.lastfmSetEnabled).toHaveBeenCalledWith(true)

    await startAuth()
    expect(window.api.lastfmStartAuth).toHaveBeenCalled()

    await finishAuth('tok')
    expect(window.api.lastfmFinishAuth).toHaveBeenCalledWith('tok')

    await disconnect()
    expect(window.api.lastfmDisconnect).toHaveBeenCalled()
  })
})
