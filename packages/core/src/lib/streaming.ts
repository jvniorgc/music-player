/** Streaming bitrate choices ('original' = direct stream, no transcoding). */
export const STREAM_QUALITIES = ['original', '320', '256', '192', '128', '96'] as const
export type StreamQuality = (typeof STREAM_QUALITIES)[number]

/** Download formats ('original' = the untouched source file). */
export const DOWNLOAD_QUALITIES = ['original', 'mp3-320', 'aac-256'] as const
export type DownloadQuality = (typeof DOWNLOAD_QUALITIES)[number]

/** Audio-cache size limits offered in settings (must match the main process). */
export const CACHE_LIMIT_OPTIONS = [512 * 1024 ** 2, 1024 ** 3, 2 * 1024 ** 3, 5 * 1024 ** 3, 10 * 1024 ** 3]

/** Bitrate forced on remote connections by the data-saver toggle. */
export const DATA_SAVER_KBPS = 128

/** True when the server host is loopback, a private/link-local IP, or an mDNS `.local` name. */
export function isLocalServer(serverUrl: string): boolean {
  let host: string
  try {
    host = new URL(serverUrl).hostname.toLowerCase()
  } catch {
    return false
  }
  if (host === 'localhost' || host.endsWith('.local')) return true
  if (host.startsWith('[')) {
    const v6 = host.slice(1, -1)
    return v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6)
  }
  const m = host.match(/^(\d+)\.(\d+)\.\d+\.\d+$/)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
}

/** Max streaming bitrate in kbps for the given prefs/server, or null for original quality. */
export function streamBitrateKbps(
  prefs: { localQuality: string; remoteQuality: string; dataSaver: boolean },
  serverUrl: string,
): number | null {
  const local = isLocalServer(serverUrl)
  const quality = local ? prefs.localQuality : prefs.remoteQuality
  let kbps = quality !== 'original' && (STREAM_QUALITIES as readonly string[]).includes(quality) ? Number(quality) : null
  if (!local && prefs.dataSaver) kbps = Math.min(kbps ?? DATA_SAVER_KBPS, DATA_SAVER_KBPS)
  return kbps
}
