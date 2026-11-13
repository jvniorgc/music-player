import { app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'

/**
 * The app was renamed to Musga, which changes Electron's default userData folder.
 * Existing installs keep their original folder so logins, downloads and settings survive.
 */
export function keepLegacyUserData(): void {
  const legacy = join(app.getPath('appData'), app.isPackaged ? 'Jellyfin Music Player' : 'jellyfin-music-player')
  if (existsSync(legacy)) app.setPath('userData', legacy)
}
