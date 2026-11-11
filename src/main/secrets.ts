import { safeStorage } from 'electron'

/** Prefix marking a value encrypted with Electron safeStorage (base64 payload). */
const ENC_PREFIX = 'enc:v1:'

function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(ENC_PREFIX)
}

/**
 * Encrypt a secret for storage at rest. Falls back to plaintext when the OS
 * keychain is unavailable (e.g. Linux without a secret service) so the app
 * keeps working; the value is transparently upgraded on a later read.
 */
export function encryptSecret(plain: string): string {
  if (!plain || !encryptionAvailable()) return plain
  try {
    return ENC_PREFIX + safeStorage.encryptString(plain).toString('base64')
  } catch (err) {
    console.warn('[secrets] encryption failed, storing plaintext', err)
    return plain
  }
}

/** Decrypt a stored secret; plaintext (legacy) values are returned unchanged. Null if undecryptable. */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (stored == null) return null
  if (!isEncrypted(stored)) return stored
  try {
    return safeStorage.decryptString(Buffer.from(stored.slice(ENC_PREFIX.length), 'base64'))
  } catch (err) {
    console.warn('[secrets] failed to decrypt stored secret', err)
    return null
  }
}

/** True when a stored value is plaintext but could now be encrypted. */
export function needsMigration(stored: string | null | undefined): boolean {
  return !!stored && !isEncrypted(stored) && encryptionAvailable()
}
