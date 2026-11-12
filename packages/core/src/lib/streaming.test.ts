import { describe, it, expect } from 'vitest'
import { isLocalServer, streamBitrateKbps } from './streaming'

describe('isLocalServer', () => {
  it.each([
    'http://localhost:8096', 'http://127.0.0.1:8096', 'http://10.0.0.5', 'http://172.16.1.1', 'http://172.31.255.1',
    'http://192.168.1.10:8096', 'http://169.254.3.3', 'http://jellyfin.local', 'http://[::1]:8096', 'http://[fd12::1]', 'http://[fe80::1]',
  ])('treats %s as local', url => expect(isLocalServer(url)).toBe(true))

  it.each(['https://music.example.com', 'http://172.32.0.1', 'http://8.8.8.8', 'not a url', ''])(
    'treats %s as remote', url => expect(isLocalServer(url)).toBe(false))
})

describe('streamBitrateKbps', () => {
  const prefs = { localQuality: 'original', remoteQuality: '192', dataSaver: false }

  it('picks the local or remote setting by server location', () => {
    expect(streamBitrateKbps(prefs, 'http://192.168.0.2')).toBeNull()
    expect(streamBitrateKbps(prefs, 'https://music.example.com')).toBe(192)
  })

  it('caps remote streaming at 128 kbps with data saver, but never raises it', () => {
    expect(streamBitrateKbps({ ...prefs, remoteQuality: 'original', dataSaver: true }, 'https://x.com')).toBe(128)
    expect(streamBitrateKbps({ ...prefs, remoteQuality: '96', dataSaver: true }, 'https://x.com')).toBe(96)
    expect(streamBitrateKbps({ ...prefs, dataSaver: true }, 'http://localhost')).toBeNull()
  })

  it('treats unknown values as original quality', () => {
    expect(streamBitrateKbps({ ...prefs, remoteQuality: 'bogus' }, 'https://x.com')).toBeNull()
  })
})
