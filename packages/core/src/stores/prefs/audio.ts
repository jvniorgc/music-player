import { createPreferences } from '../../lib/preferences'

export const useAudioPrefs = createPreferences('audio', {
  /** Output device id ('' = system default). */
  deviceId: '',
  /** Max effective volume, percent (50–100). */
  maxVolume: 100,
  /** Downmix to mono through the Web Audio chain. */
  mono: false as boolean,
  /** Keyboard/scroll volume step, percent. */
  volumeStep: 10,
})
