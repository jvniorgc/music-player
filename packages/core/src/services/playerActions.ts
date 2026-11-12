import { usePlayerStore } from '../stores/player'
import { SEEK_STEP, type ShortcutAction } from '../lib/shortcuts'
import { useAudioPrefs } from '../stores/prefs/audio'
import { useLikesStore } from '../stores/likes'

let lastVolume = 1

/** Runs a player shortcut action (shared by in-app and global shortcuts). */
const volumeStep = () => useAudioPrefs.getState().values.volumeStep / 100

export function runPlayerAction(action: Exclude<ShortcutAction, 'search'>): void {
  const p = usePlayerStore.getState()
  switch (action) {
    case 'togglePlay': p.togglePlay(); break
    case 'next': p.next(); break
    case 'previous': p.previous(); break
    case 'seekForward': p.seek(Math.min(p.currentTime + SEEK_STEP, p.duration || Infinity)); break
    case 'seekBack': p.seek(Math.max(0, p.currentTime - SEEK_STEP)); break
    case 'volumeUp': p.setVolume(Math.min(1, Math.round((p.volume + volumeStep()) * 100) / 100)); break
    case 'volumeDown': p.setVolume(Math.max(0, Math.round((p.volume - volumeStep()) * 100) / 100)); break
    case 'mute':
      if (p.volume > 0) { lastVolume = p.volume; p.setVolume(0) }
      else p.setVolume(lastVolume || 1)
      break
    case 'shuffle': p.toggleShuffle(); break
    case 'repeat': p.toggleRepeat(); break
    case 'toggleLike': if (p.currentTrack) void useLikesStore.getState().toggle(p.currentTrack.item.Id); break
  }
}
