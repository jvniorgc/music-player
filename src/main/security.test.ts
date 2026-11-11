import { describe, it, expect } from 'vitest'
import { join, resolve } from 'path'
import { isHttpUrl, isSafeExternalUrl, isSafeId, resolveInside, isCorsAllowed, originOf } from './security'

describe('URL validation', () => {
  it('accepts only http(s) URLs', () => {
    expect(isHttpUrl('http://jf.lan:8096/x')).toBe(true)
    expect(isHttpUrl('https://example.com')).toBe(true)
    for (const bad of ['file:///etc/passwd', 'javascript:alert(1)', 'local-audio://x', 'not a url', '', 42, null]) {
      expect(isHttpUrl(bad)).toBe(false)
    }
  })

  it('allows mailto: in addition to http(s) for external links', () => {
    expect(isSafeExternalUrl('mailto:me@example.com')).toBe(true)
    expect(isSafeExternalUrl('https://example.com')).toBe(true)
    expect(isSafeExternalUrl('smb://host/share')).toBe(false)
    expect(isSafeExternalUrl('file:///C:/Windows')).toBe(false)
    expect(isSafeExternalUrl('not a url')).toBe(false)
    expect(isSafeExternalUrl(42)).toBe(false)
  })

  it('derives origins', () => {
    expect(originOf('http://jf.lan:8096/a/b?c')).toBe('http://jf.lan:8096')
    expect(originOf('ftp://x')).toBeNull()
  })
})

describe('isSafeId', () => {
  it('rejects separators and traversal', () => {
    expect(isSafeId('a1b2-C3_d')).toBe(true)
    for (const bad of ['../x', 'a/b', 'a\\b', '', 'a.b', 7]) expect(isSafeId(bad)).toBe(false)
  })
})

describe('resolveInside', () => {
  const root = resolve('/app/userData/cache')

  it('accepts files strictly inside a root', () => {
    expect(resolveInside(join(root, 'audio', 'x.audio'), [root])).toBe(join(root, 'audio', 'x.audio'))
  })

  it('rejects traversal, prefix tricks, the root itself, relative paths and NUL bytes', () => {
    expect(resolveInside(join(root, '..', 'music-player.db'), [root])).toBeNull()
    expect(resolveInside(root + '-evil/x', [root])).toBeNull()
    expect(resolveInside(root, [root])).toBeNull()
    expect(resolveInside('cache/x', [root])).toBeNull()
    expect(resolveInside(join(root, 'x\0.audio'), [root])).toBeNull()
    expect(resolveInside(undefined, [root])).toBeNull()
  })
})

describe('isCorsAllowed', () => {
  const origins = ['http://jf.lan:8096']
  it('allows configured origins and https public metadata APIs', () => {
    expect(isCorsAllowed('http://jf.lan:8096/Items', origins)).toBe(true)
    expect(isCorsAllowed('https://coverartarchive.org/release/x', origins)).toBe(true)
    expect(isCorsAllowed('https://ia801.us.archive.org/x', origins)).toBe(true)
  })
  it('denies everything else', () => {
    expect(isCorsAllowed('http://jf.lan:9999/Items', origins)).toBe(false)
    expect(isCorsAllowed('not a url', origins)).toBe(false)
    expect(isCorsAllowed('http://coverartarchive.org/x', origins)).toBe(false)
    expect(isCorsAllowed('https://notarchive.org/x', origins)).toBe(false)
    expect(isCorsAllowed('https://evil.com/?musicbrainz.org', origins)).toBe(false)
  })
})
