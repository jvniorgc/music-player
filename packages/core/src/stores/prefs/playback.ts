import { createPreferences } from '../../lib/preferences'

export type QueueEndBehavior = 'stop' | 'repeat' | 'radio'
export type SongClickBehavior = 'replace' | 'next' | 'end'

export const CROSSFADE_MAX = 12
export const PREVIOUS_THRESHOLDS = [0, 3, 5, 10] as const

export const usePlaybackPrefs = createPreferences('playback', {
  /** Crossfade length in seconds (0 = off). */
  crossfade: 0 as number,
  gapless: true as boolean,
  /** Seconds after which "previous" restarts the track instead (0 = always go back). */
  previousThreshold: 3 as number,
  queueEnd: 'stop' as QueueEndBehavior,
  songClick: 'replace' as SongClickBehavior,
})
