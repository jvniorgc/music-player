import { describe, it, expect } from 'vitest'
import {
  formatTime, formatDuration, formatTicks, formatTotalDuration,
  ticksToSeconds, secondsToTicks, formatFileSize, formatSpeed, artistNames,
} from './format'

describe('format helpers', () => {
  it('formatTime renders m:ss and guards non-finite values', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(65.9)).toBe('1:05')
    expect(formatTime(NaN)).toBe('0:00')
    expect(formatTime(Infinity)).toBe('0:00')
  })

  it('formatDuration/formatTicks return empty for unknown lengths', () => {
    expect(formatDuration(undefined)).toBe('')
    expect(formatDuration(0)).toBe('')
    expect(formatDuration(125)).toBe('2:05')
    expect(formatTicks(undefined)).toBe('')
    expect(formatTicks(0)).toBe('')
    expect(formatTicks(1_259_999_999)).toBe('2:05')
  })

  it('converts between ticks and seconds', () => {
    expect(ticksToSeconds(25_000_000)).toBe(2.5)
    expect(secondsToTicks(2.5)).toBe(25_000_000)
    expect(secondsToTicks(0.00000001)).toBe(0)
  })

  it('formatTotalDuration switches to hours past 60 minutes', () => {
    const min = 60 * 10_000_000
    expect(formatTotalDuration([])).toBe('0 min')
    expect(formatTotalDuration([{ RunTimeTicks: 30 * min }, {}])).toBe('30 min')
    expect(formatTotalDuration([{ RunTimeTicks: 60 * min }, { RunTimeTicks: 5 * min }])).toBe('1 h 5 min')
  })

  it('formats sizes and speeds', () => {
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(2048)).toBe('2 KB')
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB')
    expect(formatSpeed(2048)).toBe('2 KB/s')
  })

  it('artistNames joins artists with fallbacks', () => {
    expect(artistNames({ Artists: ['A', 'B'], AlbumArtist: 'X' })).toBe('A, B')
    expect(artistNames({ Artists: [], AlbumArtist: 'X' })).toBe('X')
    expect(artistNames({}, 'Unknown')).toBe('Unknown')
    expect(artistNames(undefined)).toBe('')
  })
})
