import { createPreferences } from '../../lib/preferences'

export const useNotificationPrefs = createPreferences('notifications', {
  trackChange: false as boolean,
  onlyWhenUnfocused: true as boolean,
  downloadComplete: false as boolean,
})
