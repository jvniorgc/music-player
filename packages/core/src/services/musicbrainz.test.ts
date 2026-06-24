import { describe, it, expect } from 'vitest'
import {
  getCoverArtUrl,
  formatMBDate,
  getArtistName,
  getLabel,
  getCatalogNumber,
  type MBRelease,
} from './musicbrainz'

describe('getCoverArtUrl', () => {
  it('builds a Cover Art Archive front-image url with the default size', () => {
    expect(getCoverArtUrl('rel-1')).toBe('https://coverartarchive.org/release/rel-1/front-500')
  })

  it('honors the requested size', () => {
    expect(getCoverArtUrl('rel-1', 1200)).toBe('https://coverartarchive.org/release/rel-1/front-1200')
  })
})

describe('formatMBDate', () => {
  it('returns just the year', () => {
    expect(formatMBDate('1997-08-15')).toBe('1997')
    expect(formatMBDate('2020')).toBe('2020')
  })

  it('returns empty string for undefined', () => {
    expect(formatMBDate()).toBe('')
  })
})

describe('release field extractors', () => {
  const release: MBRelease = {
    id: 'r1',
    title: 'Album',
    'artist-credit': [
      { name: 'A', artist: { id: 'a1', name: 'A' } },
      { name: ' & B', artist: { id: 'a2', name: 'B' } },
    ],
    'label-info': [{ 'catalog-number': 'CAT-001', label: { name: 'Label X' } }],
  }

  it('getArtistName concatenates artist-credit names', () => {
    expect(getArtistName(release)).toBe('A & B')
  })

  it('getLabel reads the first label name', () => {
    expect(getLabel(release)).toBe('Label X')
  })

  it('getCatalogNumber reads the first catalog number', () => {
    expect(getCatalogNumber(release)).toBe('CAT-001')
  })

  it('returns empty strings when fields are missing', () => {
    const bare: MBRelease = { id: 'r2', title: 'Bare' }
    expect(getArtistName(bare)).toBe('')
    expect(getLabel(bare)).toBe('')
    expect(getCatalogNumber(bare)).toBe('')
  })
})
