import type { JellyfinItem } from '../services/jellyfin'

/** Jellyfin RunTimeTicks are 100ns units. */
export const TICKS_PER_SECOND = 10_000_000

export function ticksToSeconds(ticks: number): number {
  return ticks / TICKS_PER_SECOND
}

export function secondsToTicks(seconds: number): number {
  return Math.floor(seconds * TICKS_PER_SECOND)
}

/** m:ss for a playback position; non-finite values render as 0:00. */
export function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** m:ss for a track length in seconds; empty string when unknown/zero. */
export function formatDuration(seconds?: number): string {
  if (!seconds) return ''
  return formatTime(seconds)
}

/** m:ss for a Jellyfin RunTimeTicks value; empty string when unknown/zero. */
export function formatTicks(ticks?: number): string {
  if (!ticks) return ''
  return formatTime(Math.floor(ticks / TICKS_PER_SECOND))
}

/** "N min" or "H h M min" for the summed length of items. */
export function formatTotalDuration(items: Pick<JellyfinItem, 'RunTimeTicks'>[]): string {
  const totalTicks = items.reduce((sum, item) => sum + (item.RunTimeTicks || 0), 0)
  const totalMinutes = Math.floor(totalTicks / TICKS_PER_SECOND / 60)
  if (totalMinutes < 60) return `${totalMinutes} min`
  return `${Math.floor(totalMinutes / 60)} h ${totalMinutes % 60} min`
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
}

/** "Artist A, Artist B", falling back to AlbumArtist, then `fallback`. */
export function artistNames(
  item: Pick<JellyfinItem, 'Artists' | 'AlbumArtist'> | undefined | null,
  fallback = ''
): string {
  return item?.Artists?.join(', ') || item?.AlbumArtist || fallback
}
