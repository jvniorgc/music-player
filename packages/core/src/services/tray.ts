import type { TrayCommand } from '../platform'
import { t, useI18nStore } from '../i18n'

export interface TrayHandlers {
  playPause: () => void
  next: () => void
  previous: () => void
}

/** Keeps the desktop tray menu localized and routes its playback commands. Returns a cleanup. */
export function initTrayIntegration(handlers: TrayHandlers): () => void {
  const api = window.api
  const sendLabels = () => {
    api.systemSetTrayLabels?.({
      playPause: t('prefs.system.trayPlayPause'),
      next: t('prefs.system.trayNext'),
      previous: t('prefs.system.trayPrevious'),
      show: t('prefs.system.trayShow'),
      quit: t('prefs.system.trayQuit'),
    }).catch(() => {})
  }
  sendLabels()
  const offLocale = useI18nStore.subscribe((s, prev) => { if (s.locale !== prev.locale) sendLabels() })
  const commands: Record<TrayCommand, () => void> = {
    playpause: handlers.playPause,
    next: handlers.next,
    previous: handlers.previous,
  }
  const offCommand = api.onTrayCommand?.(cmd => commands[cmd]?.())
  return () => {
    offLocale()
    offCommand?.()
  }
}
