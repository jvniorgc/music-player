import type { JellyfinItem } from './jellyfin'
import { jellyfin } from './jellyfin'
import { usePlayerStore } from '../stores/player'
import { useNotificationPrefs } from '../stores/prefs/notifications'
import { t } from '../i18n'

const supported = () => typeof Notification !== 'undefined' && !!Notification

function show(title: string, body: string, icon?: string): void {
  if (!supported() || Notification.permission !== 'granted') return
  const n = new Notification(title, { body, icon, silent: true })
  n.onclick = () => { void window.api.focusWindow?.() }
}

function coverUrl(item: JellyfinItem): string | undefined {
  const tag = item.ImageTags?.Primary
  if (!tag) return undefined
  return jellyfin.getImageUrl(item.AlbumId || item.Id, tag)
}

/** Asks for notification permission (granted by default in Electron). */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!supported()) return false
  try { return (await Notification.requestPermission()) === 'granted' } catch { return false }
}

/** Shows a desktop notification whenever a new track starts playing (if enabled). */
export function initNotifications(): () => void {
  let lastId: string | null = null
  return usePlayerStore.subscribe(({ currentTrack, isPlaying }) => {
    if (!currentTrack || !isPlaying || currentTrack.id === lastId) return
    lastId = currentTrack.id
    const prefs = useNotificationPrefs.getState().values
    if (!prefs.trackChange) return
    if (prefs.onlyWhenUnfocused && document.hasFocus()) return
    const item = currentTrack.item
    const artist = item.Artists?.length ? item.Artists.join(', ') : item.AlbumArtist || ''
    show(item.Name, artist, coverUrl(item))
  })
}

export function notifyDownloadComplete(item: JellyfinItem): void {
  if (!useNotificationPrefs.getState().values.downloadComplete) return
  show(t('prefs.notify.downloadDone'), item.Name, coverUrl(item))
}
