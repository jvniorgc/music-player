import { describe, it, expect, beforeEach } from 'vitest'
import {
  configure,
  getConfig,
  deriveDefaultUrl,
  isConfigured,
  getFileExtension,
  getFileName,
  getDirectory,
  formatFileSize,
  formatSpeed,
  formatDuration,
  isAudioFile,
  groupFilesByDirectory,
  type SlskdFile,
} from './slskd'

// Reset module-level config to a known state before each test.
beforeEach(() => {
  configure({ url: '', username: 'slskd', password: 'slskd' })
})

describe('slskd config', () => {
  it('strips trailing slashes from the url and stores credentials', () => {
    configure({ url: 'http://host:5030///', username: 'u', password: 'p' })
    expect(getConfig()).toEqual({ url: 'http://host:5030', username: 'u', password: 'p' })
  })

  it('isConfigured reflects whether a url is set', () => {
    expect(isConfigured()).toBe(false)
    configure({ url: 'http://host:5030', username: 'u', password: 'p' })
    expect(isConfigured()).toBe(true)
  })
})

describe('deriveDefaultUrl', () => {
  it('derives the slskd url from a jellyfin url on the default port', () => {
    expect(deriveDefaultUrl('http://192.168.1.10:8096')).toBe('http://192.168.1.10:5030')
    expect(deriveDefaultUrl('https://media.example.com:8920/')).toBe('https://media.example.com:5030')
  })

  it('returns empty string for an invalid url', () => {
    expect(deriveDefaultUrl('not a url')).toBe('')
  })
})

describe('path helpers', () => {
  it('getFileExtension lowercases; with no dot it returns the whole name lowercased', () => {
    expect(getFileExtension('Song.FLAC')).toBe('flac')
    // Quirk of current implementation: no '.' means split().pop() is the whole string.
    expect(getFileExtension('NoExt')).toBe('noext')
  })

  it('getFileName handles both slash styles', () => {
    expect(getFileName('C:\\Music\\a\\track.mp3')).toBe('track.mp3')
    expect(getFileName('/music/a/track.mp3')).toBe('track.mp3')
    expect(getFileName('bare.mp3')).toBe('bare.mp3')
  })

  it('getDirectory returns the parent path joined with forward slashes', () => {
    expect(getDirectory('C:\\Music\\Album\\track.mp3')).toBe('C:/Music/Album')
    expect(getDirectory('/music/album/track.mp3')).toBe('/music/album')
  })
})

describe('formatting helpers', () => {
  it('formatFileSize switches units at 1KB and 1MB boundaries', () => {
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(2048)).toBe('2 KB')
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB')
  })

  it('formatSpeed mirrors formatFileSize with /s suffix', () => {
    expect(formatSpeed(900)).toBe('900 B/s')
    expect(formatSpeed(2048)).toBe('2 KB/s')
    expect(formatSpeed(3 * 1024 * 1024)).toBe('3.0 MB/s')
  })

  it('formatDuration renders m:ss and handles undefined/zero', () => {
    expect(formatDuration(undefined)).toBe('')
    expect(formatDuration(0)).toBe('')
    expect(formatDuration(5)).toBe('0:05')
    expect(formatDuration(125)).toBe('2:05')
  })
})

describe('isAudioFile', () => {
  it('recognizes common audio extensions case-insensitively', () => {
    for (const f of ['a.flac', 'b.MP3', 'c.opus', 'd.m4a', 'e.alac']) {
      expect(isAudioFile(f)).toBe(true)
    }
  })

  it('rejects non-audio files', () => {
    expect(isAudioFile('cover.jpg')).toBe(false)
    expect(isAudioFile('readme')).toBe(false)
  })
})

describe('groupFilesByDirectory', () => {
  it('groups files under their containing directory', () => {
    const files: SlskdFile[] = [
      { filename: 'C:\\Album\\01.mp3', size: 1 },
      { filename: 'C:\\Album\\02.mp3', size: 2 },
      { filename: 'C:\\Other\\03.mp3', size: 3 },
    ]
    const grouped = groupFilesByDirectory(files)
    expect(grouped.get('C:/Album')).toHaveLength(2)
    expect(grouped.get('C:/Other')).toHaveLength(1)
  })
})
