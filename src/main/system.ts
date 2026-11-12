import { app, ipcMain, Menu, nativeImage, Tray, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import Database from 'better-sqlite3'
import { join } from 'path'
import iconPath from '../../build/icon.png?asset'
import { getDatabase } from './database'
import type { SystemSettings, SystemSettingsState, TrayCommand, TrayLabels } from '@music-player/core/platform'

const KEYS: Record<keyof SystemSettings, string> = {
  launchAtLogin: 'system_launch_at_login',
  startMinimized: 'system_start_minimized',
  closeToTray: 'system_close_to_tray',
  hardwareAcceleration: 'system_hardware_acceleration',
}

const DEFAULTS: SystemSettings = {
  launchAtLogin: false,
  startMinimized: false,
  closeToTray: false,
  hardwareAcceleration: true,
}

/** Tray labels until the renderer sends localized ones. */
let labels: TrayLabels = { playPause: 'Play/Pause', next: 'Next', previous: 'Previous', show: 'Show', quit: 'Quit' }
let hardwareAccelerationAtLaunch = true
let quitting = false
let tray: Tray | null = null
let getWindow!: () => BrowserWindow | null

function toBool(raw: string | undefined, fallback: boolean): boolean {
  return raw === undefined ? fallback : raw === '1'
}

function readSettings(): SystemSettings {
  const db = getDatabase()
  const out = { ...DEFAULTS }
  for (const k of Object.keys(KEYS) as (keyof SystemSettings)[]) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(KEYS[k]) as { value: string } | undefined
    out[k] = toBool(row?.value, DEFAULTS[k])
  }
  return out
}

function state(): SystemSettingsState {
  const s = readSettings()
  return { ...s, restartRequired: s.hardwareAcceleration !== hardwareAccelerationAtLaunch }
}

/** Must run before `app.whenReady()`: reads the saved setting straight from the DB file. */
export function applyHardwareAcceleration(): void {
  let enabled = true
  try {
    const db = new Database(join(app.getPath('userData'), 'music-player.db'), { readonly: true, fileMustExist: true })
    try {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(KEYS.hardwareAcceleration) as { value: string } | undefined
      enabled = toBool(row?.value, true)
    } finally {
      db.close()
    }
  } catch { /* first launch: no database yet */ }
  hardwareAccelerationAtLaunch = enabled
  if (!enabled) app.disableHardwareAcceleration()
}

function showWindow(): void {
  const win = getWindow()
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function send(command: TrayCommand): void {
  getWindow()?.webContents.send('system:tray-command', command)
}

function buildTrayMenu(): void {
  if (!tray) return
  const template: MenuItemConstructorOptions[] = [
    { label: labels.playPause, click: () => send('playpause') },
    { label: labels.next, click: () => send('next') },
    { label: labels.previous, click: () => send('previous') },
    { type: 'separator' },
    { label: labels.show, click: showWindow },
    { label: labels.quit, click: () => { quitting = true; app.quit() } },
  ]
  tray.setContextMenu(Menu.buildFromTemplate(template))
}

function updateTray(enabled: boolean): void {
  if (enabled && !tray) {
    tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }))
    tray.setToolTip(app.getName())
    tray.on('click', showWindow)
    buildTrayMenu()
  } else if (!enabled && tray) {
    tray.destroy()
    tray = null
  }
}

/** Extra BrowserWindow options: start hidden when "start minimized" is on. */
export function windowOptions(): { show?: boolean } {
  return readSettings().startMinimized ? { show: false } : {}
}

/** Close-to-tray and start-minimized behavior for the main window. */
export function attachWindow(win: BrowserWindow): void {
  win.on('close', (e) => {
    if (!quitting && tray) {
      e.preventDefault()
      win.hide()
    }
  })
  if (readSettings().startMinimized) {
    win.once('ready-to-show', () => {
      if (tray) return
      win.showInactive()
      win.minimize()
    })
  }
}

function isLabels(v: unknown): v is TrayLabels {
  const o = v as Record<string, unknown> | null
  return !!o && (['playPause', 'next', 'previous', 'show', 'quit'] as const).every(k => typeof o[k] === 'string')
}

export function setupSystem(windowGetter: () => BrowserWindow | null): void {
  getWindow = windowGetter
  const db = getDatabase()

  ipcMain.handle('system:get-settings', () => state())

  ipcMain.handle('system:set-settings', (_e, patch: Partial<SystemSettings> | null) => {
    for (const k of Object.keys(KEYS) as (keyof SystemSettings)[]) {
      const v = patch?.[k]
      if (typeof v !== 'boolean') continue
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(KEYS[k], v ? '1' : '0')
      if (k === 'launchAtLogin') app.setLoginItemSettings({ openAtLogin: v })
      if (k === 'closeToTray') updateTray(v)
    }
    return state()
  })

  ipcMain.handle('system:set-tray-labels', (_e, next: unknown) => {
    if (!isLabels(next)) return
    labels = { playPause: next.playPause, next: next.next, previous: next.previous, show: next.show, quit: next.quit }
    buildTrayMenu()
  })

  ipcMain.handle('system:relaunch', () => {
    quitting = true
    app.relaunch()
    app.quit()
  })

  app.on('before-quit', () => { quitting = true })

  updateTray(readSettings().closeToTray)
}
