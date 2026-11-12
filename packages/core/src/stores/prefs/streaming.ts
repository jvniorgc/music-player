import { createPreferences } from '../../lib/preferences'

/** Streaming/download quality prefs; values are `StreamQuality` / `DownloadQuality` from lib/streaming. */
export const useStreamingPrefs = createPreferences('streaming', {
  localQuality: 'original' as string,
  remoteQuality: 'original' as string,
  dataSaver: false as boolean,
  downloadQuality: 'original' as string,
  autoDownloadLiked: false as boolean,
})
