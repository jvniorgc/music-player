import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ available: true }))

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => h.available,
    encryptString: (s: string) => Buffer.from('X' + s, 'utf8'),
    decryptString: (b: Buffer) => {
      const s = b.toString('utf8')
      if (!s.startsWith('X')) throw new Error('bad')
      return s.slice(1)
    },
  },
}))

import { encryptSecret, decryptSecret, needsMigration, isEncrypted } from './secrets'

beforeEach(() => { h.available = true })

describe('secrets', () => {
  it('round-trips through safeStorage with a marker prefix', () => {
    const enc = encryptSecret('token-123')
    expect(isEncrypted(enc)).toBe(true)
    expect(enc).not.toContain('token-123')
    expect(decryptSecret(enc)).toBe('token-123')
  })

  it('reads legacy plaintext values and flags them for migration', () => {
    expect(decryptSecret('plain')).toBe('plain')
    expect(needsMigration('plain')).toBe(true)
    expect(needsMigration(encryptSecret('x'))).toBe(false)
  })

  it('falls back to plaintext when encryption is unavailable', () => {
    h.available = false
    expect(encryptSecret('t')).toBe('t')
    expect(needsMigration('t')).toBe(false)
  })

  it('returns null for undecryptable values', () => {
    expect(decryptSecret('enc:v1:' + Buffer.from('garbage').toString('base64'))).toBeNull()
    expect(decryptSecret(null)).toBeNull()
  })
})
