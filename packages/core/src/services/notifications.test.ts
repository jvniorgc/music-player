import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initNotifications, notifyDownloadComplete, requestNotificationPermission } from './notifications'
import { useNotificationPrefs } from '../stores/prefs/notifications'
import { usePlayerStore } from '../stores/player'

vi.mock('./jellyfin', () => ({
  jellyfin: { getImageUrl: vi.fn((id: string) => `img:${id}`) },
}))

const created: { title: string; opts: NotificationOptions; onclick?: () => void }[] = []
class FakeNotification {
  static permission: NotificationPermission = 'granted'
  static requestPermission = vi.fn(async () => FakeNotification.permission)
  onclick?: () => void
  constructor(title: string, opts: NotificationOptions) { created.push(Object.assign(this, { title, opts })) }
}

const track = (id: string, extra = {}) => ({ id, item: { Id: id, Name: `Song ${id}`, Artists: ['A', 'B'], ...extra } })

beforeEach(() => {
  created.length = 0
  FakeNotification.permission = 'granted'
  vi.stubGlobal('Notification', FakeNotification)
  vi.spyOn(document, 'hasFocus').mockReturnValue(false)
  useNotificationPrefs.getState().reset()
  usePlayerStore.setState({ currentTrack: null, isPlaying: false })
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('track change notifications', () => {
  it('stays silent while disabled', () => {
    const stop = initNotifications()
    usePlayerStore.setState({ currentTrack: track('1') as any, isPlaying: true })
    stop()
    expect(created).toHaveLength(0)
  })

  it('notifies once per playing track with title, artists and cover; click focuses', () => {
    useNotificationPrefs.getState().set({ trackChange: true })
    const stop = initNotifications()
    usePlayerStore.setState({ currentTrack: track('1', { AlbumId: 'al', ImageTags: { Primary: 't' } }) as any, isPlaying: false })
    expect(created).toHaveLength(0) // paused (e.g. restored session)
    usePlayerStore.setState({ isPlaying: true })
    usePlayerStore.setState({ isPlaying: false })
    usePlayerStore.setState({ isPlaying: true })
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({ title: 'Song 1', opts: { body: 'A, B', icon: 'img:al' } })
    created[0].onclick!()
    expect(window.api.focusWindow).toHaveBeenCalled()

    usePlayerStore.setState({ currentTrack: track('2', { Artists: undefined, AlbumArtist: 'AA', ImageTags: { Primary: 'x' } }) as any })
    expect(created[1].opts).toMatchObject({ body: 'AA', icon: 'img:2' })
    usePlayerStore.setState({ currentTrack: track('3', { Artists: undefined }) as any })
    expect(created[2].opts).toMatchObject({ body: '', icon: undefined })
    stop()
  })

  it('skips while the window is focused unless configured otherwise', () => {
    vi.mocked(document.hasFocus).mockReturnValue(true)
    useNotificationPrefs.getState().set({ trackChange: true })
    const stop = initNotifications()
    usePlayerStore.setState({ currentTrack: track('1') as any, isPlaying: true })
    expect(created).toHaveLength(0)
    useNotificationPrefs.getState().set({ onlyWhenUnfocused: false })
    usePlayerStore.setState({ currentTrack: track('2') as any })
    expect(created).toHaveLength(1)
    stop()
  })

  it('does nothing without permission or Notification support', () => {
    useNotificationPrefs.getState().set({ trackChange: true })
    const stop = initNotifications()
    FakeNotification.permission = 'denied'
    usePlayerStore.setState({ currentTrack: track('1') as any, isPlaying: true })
    vi.stubGlobal('Notification', undefined)
    usePlayerStore.setState({ currentTrack: track('2') as any })
    expect(created).toHaveLength(0)
    stop()
  })
})

describe('download notifications', () => {
  it('notifies only when enabled', () => {
    notifyDownloadComplete({ Id: 'd', Name: 'Tune' } as any)
    expect(created).toHaveLength(0)
    useNotificationPrefs.getState().set({ downloadComplete: true })
    notifyDownloadComplete({ Id: 'd', Name: 'Tune' } as any)
    expect(created[0]).toMatchObject({ title: 'Download complete', opts: { body: 'Tune' } })
  })
})

describe('requestNotificationPermission', () => {
  it('resolves to whether notifications are allowed', async () => {
    expect(await requestNotificationPermission()).toBe(true)
    FakeNotification.permission = 'default'
    expect(await requestNotificationPermission()).toBe(false)
    FakeNotification.requestPermission.mockRejectedValueOnce(new Error('x'))
    expect(await requestNotificationPermission()).toBe(false)
    vi.stubGlobal('Notification', undefined)
    expect(await requestNotificationPermission()).toBe(false)
  })
})
