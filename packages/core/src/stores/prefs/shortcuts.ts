import { createPreferences } from '../../lib/preferences'

/** In-app shortcut overrides: '' keeps the default binding. */
export const useShortcutPrefs = createPreferences('shortcuts', {
  togglePlay: '', next: '', previous: '', seekForward: '', seekBack: '',
  volumeUp: '', volumeDown: '', mute: '', shuffle: '', repeat: '', search: '',
})

export const GLOBAL_SHORTCUT_DEFAULTS = {
  togglePlay: 'Mod+Alt+Space',
  next: 'Mod+Alt+ArrowRight',
  previous: 'Mod+Alt+ArrowLeft',
  volumeUp: 'Mod+Alt+ArrowUp',
  volumeDown: 'Mod+Alt+ArrowDown',
}

/** System-wide media shortcuts (desktop): off by default. */
export const useGlobalShortcutPrefs = createPreferences('globalShortcuts', {
  enabled: false as boolean,
  ...GLOBAL_SHORTCUT_DEFAULTS,
})
