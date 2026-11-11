import { describe, it, expect, beforeEach } from 'vitest'
import { normalizeServerUrl, friendlyLoginError, LOGIN_ERRORS, loadLastLogin, saveLastLogin } from './url'

describe('normalizeServerUrl', () => {
  it.each([
    ['  https://music.example.com/  ', 'https://music.example.com'],
    ['music.example.com', 'https://music.example.com'],
    ['192.168.1.10:8096', 'http://192.168.1.10:8096'],
    ['myserver:8096///', 'http://myserver:8096'],
    ['http://music.example.com', 'http://music.example.com'],
    ['HTTP://host:8096/jellyfin/', 'http://host:8096/jellyfin'],
    ['example.com/jellyfin', 'https://example.com/jellyfin'],
    ['   ', ''],
  ])('%j → %j', (input, out) => expect(normalizeServerUrl(input)).toBe(out))
})

describe('friendlyLoginError', () => {
  it('maps statuses and network failures', () => {
    expect(friendlyLoginError(new Error('Invalid credentials'))).toBe(LOGIN_ERRORS.invalidCredentials)
    expect(friendlyLoginError(Object.assign(new Error('x'), { status: 400 }))).toBe(LOGIN_ERRORS.badRequest)
    expect(friendlyLoginError(new Error('Error connecting: 404'))).toBe(LOGIN_ERRORS.notFound)
    expect(friendlyLoginError(new Error('Error connecting: 502'))).toBe(LOGIN_ERRORS.server)
    expect(friendlyLoginError(new TypeError('Failed to fetch'))).toBe(LOGIN_ERRORS.unreachable)
    expect(friendlyLoginError(new TypeError('Invalid URL'))).toBe(LOGIN_ERRORS.invalidUrl)
    expect(friendlyLoginError(new DOMException('t', 'TimeoutError'))).toBe(LOGIN_ERRORS.timeout)
    expect(friendlyLoginError(new Error('weird'))).toBe(LOGIN_ERRORS.unknown)
    expect(friendlyLoginError(null)).toBe(LOGIN_ERRORS.unknown)
  })
})

describe('last login', () => {
  beforeEach(() => localStorage.clear())
  it('round-trips and tolerates garbage', () => {
    expect(loadLastLogin()).toEqual({ serverUrl: '', username: '' })
    saveLastLogin('https://a', 'me')
    expect(loadLastLogin()).toEqual({ serverUrl: 'https://a', username: 'me' })
    localStorage.setItem('last_login', '{bad')
    expect(loadLastLogin()).toEqual({ serverUrl: '', username: '' })
  })
})
