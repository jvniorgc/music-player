import type { MessageKey } from '../i18n'

/**
 * Normalizes a user-typed server address:
 * trims whitespace and trailing slashes, keeps an explicit http(s) scheme,
 * and otherwise adds http:// when a port is given (typical LAN Jellyfin, e.g. host:8096)
 * or https:// for bare hostnames (typical reverse-proxied servers).
 */
export function normalizeServerUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, '')
  if (!url) return ''
  const scheme = url.match(/^([a-z][a-z0-9+.-]*):\/\//i)
  if (scheme) {
    url = scheme[1].toLowerCase() + url.slice(scheme[1].length)
  } else {
    const host = url.split('/')[0]
    const hasPort = /:\d+$/.test(host)
    url = `${hasPort ? 'http' : 'https'}://${url}`
  }
  return url
}

/** Login error message keys (translated by the login screen). */
export const LOGIN_ERRORS = {
  invalidCredentials: 'login.error.invalidCredentials',
  badRequest: 'login.error.badRequest',
  notFound: 'login.error.notFound',
  server: 'login.error.server',
  timeout: 'login.error.timeout',
  unreachable: 'login.error.unreachable',
  invalidUrl: 'login.error.invalidUrl',
  unknown: 'login.error.unknown',
} as const satisfies Record<string, MessageKey>

/** Maps an authentication failure to a friendly message key. */
export function friendlyLoginError(err: unknown): string {
  const e = err as { name?: string; message?: string; status?: number } | null
  const status = e?.status ?? Number(e?.message?.match(/\b([45]\d\d)\b/)?.[1])
  if (status === 401 || status === 403 || e?.message === 'Invalid credentials') return LOGIN_ERRORS.invalidCredentials
  if (status === 400) return LOGIN_ERRORS.badRequest
  if (status === 404) return LOGIN_ERRORS.notFound
  if (status && status >= 500) return LOGIN_ERRORS.server
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return LOGIN_ERRORS.timeout
  if (e?.name === 'TypeError' && /url/i.test(e.message ?? '') && /invalid/i.test(e.message ?? '')) return LOGIN_ERRORS.invalidUrl
  if (e?.name === 'TypeError' || /fetch|network/i.test(e?.message ?? '')) return LOGIN_ERRORS.unreachable
  return LOGIN_ERRORS.unknown
}

const LAST_LOGIN_KEY = 'last_login'

export function loadLastLogin(): { serverUrl: string; username: string } {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_LOGIN_KEY) ?? 'null')
    return {
      serverUrl: typeof v?.serverUrl === 'string' ? v.serverUrl : '',
      username: typeof v?.username === 'string' ? v.username : '',
    }
  } catch {
    return { serverUrl: '', username: '' }
  }
}

export function saveLastLogin(serverUrl: string, username: string): void {
  try { localStorage.setItem(LAST_LOGIN_KEY, JSON.stringify({ serverUrl, username })) } catch { /* ignore */ }
}
