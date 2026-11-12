import { describe, it, expect } from 'vitest'
import { contextPath } from './playbackContext'

describe('contextPath', () => {
  it.each([
    [{ type: 'album', id: 'a', name: 'A' }, '/album/a'],
    [{ type: 'album', name: 'A' }, null],
    [{ type: 'playlist', id: 'p', name: 'P' }, '/playlist/p'],
    [{ type: 'playlist', name: 'P' }, null],
    [{ type: 'artist', id: 'r', name: 'R' }, '/artist/r'],
    [{ type: 'artist', name: 'R' }, null],
    [{ type: 'songs', name: 'Songs' }, '/songs'],
    [{ type: 'home', name: 'Recently played' }, '/'],
    [{ type: 'downloads', name: 'Downloads' }, '/downloads'],
    [{ type: 'liked', name: 'Liked songs' }, '/liked'],
    [{ type: 'search', id: 'a b', name: 's' }, '/search?q=a%20b'],
    [{ type: 'search', name: 's' }, '/search'],
    [{ type: 'mix', name: 'Instant mix' }, null],
    [null, null],
  ] as const)('%j → %s', (ctx, path) => {
    expect(contextPath(ctx as never)).toBe(path)
  })
})
