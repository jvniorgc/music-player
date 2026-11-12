import { createPreferences } from '../../lib/preferences'

/** Renderer-side system preferences (main-process ones live in SQLite, see window.api.systemGetSettings). */
export const useSystemPrefs = createPreferences('system', {
  resumeSession: true as boolean,
  resumeAutoplay: false as boolean,
})
