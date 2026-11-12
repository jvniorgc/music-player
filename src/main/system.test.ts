import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const h = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  appHandlers: new Map<string, (...args: any[]) => any>(),
  userData: '',
  trays: [] as any[],
  menus: [] as any[],
}))

vi.mock('electron', () => {
  class Tray {
    handlers = new Map<string, () => void>()
    setToolTip = vi.fn()
    setContextMenu = vi.fn()
    destroy = vi.fn()
    on = (e: string, cb: () => void) => { this.handlers.set(e, cb) }
    constructor(public image: unknown) { h.trays.push(this) }
  }
  return {
    app: {
      getPath: () => h.userData,
      getName: () => 'Music',
      on: (event: string, cb: (...a: any[]) => any) => h.appHandlers.set(event, cb),
      setLoginItemSettings: vi.fn(),
      disableHardwareAcceleration: vi.fn(),
      relaunch: vi.fn(),
      quit: vi.fn(),
    },
    ipcMain: { handle: (channel: string, cb: (...a: any[]) => any) => h.handlers.set(channel, cb) },
    Tray,
    Menu: { buildFromTemplate: (t: any[]) => { h.menus.push(t); return { template: t } } },
    nativeImage: { createFromPath: () => ({ resize: () => 'img' }) },
  }
})
vi.mock('../../build/icon.png?asset', () => ({ default: '/icon.png' }))

let electron: typeof import('electron')
let sys: typeof import('./system')
let db: typeof import('./database')

const invoke = (channel: string, ...args: unknown[]) => h.handlers.get(channel)!({}, ...args)

function makeWindow() {
  const events = new Map<string, (...a: any[]) => void>()
  return {
    events,
    on: vi.fn((e: string, cb: any) => { events.set(e, cb) }),
    once: vi.fn((e: string, cb: any) => { events.set(e, cb) }),
    hide: vi.fn(), show: vi.fn(), focus: vi.fn(), minimize: vi.fn(), showInactive: vi.fn(),
    isMinimized: vi.fn(() => true), restore: vi.fn(),
    webContents: { send: vi.fn() },
  }
}

beforeAll(async () => {
  h.userData = mkdtempSync(join(tmpdir(), 'mp-sys-'))
  mkdirSync(h.userData, { recursive: true })
  electron = await import('electron')
  db = await import('./database')
  sys = await import('./system')
})

afterAll(() => {
  try { rmSync(h.userData, { recursive: true, force: true }) } catch {}
})

beforeEach(() => {
  h.menus.length = 0
})

describe('hardware acceleration (before app ready)', () => {
  it('keeps acceleration when no database exists yet', () => {
    sys.applyHardwareAcceleration()
    expect(electron.app.disableHardwareAcceleration).not.toHaveBeenCalled()
  })

  it('disables acceleration when the saved setting is off', () => {
    db.initDatabase()
    db.getDatabase().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('system_hardware_acceleration', '0')
    sys.applyHardwareAcceleration()
    expect(electron.app.disableHardwareAcceleration).toHaveBeenCalledTimes(1)
    db.getDatabase().prepare('DELETE FROM settings').run()
  })
})

describe('setupSystem', () => {
  let win: ReturnType<typeof makeWindow>

  beforeAll(() => {
    win = makeWindow()
    sys.setupSystem(() => win as any)
  })

  it('defaults preserve current behavior', async () => {
    expect(await invoke('system:get-settings')).toEqual({
      launchAtLogin: false, startMinimized: false, closeToTray: false, hardwareAcceleration: true, restartRequired: true,
    })
    expect(sys.windowOptions()).toEqual({})
    expect(h.trays).toHaveLength(0)
  })

  it('reports restart required only while the saved HW setting differs from launch', async () => {
    expect((await invoke('system:set-settings', { hardwareAcceleration: false })).restartRequired).toBe(false)
    expect((await invoke('system:set-settings', { hardwareAcceleration: true })).restartRequired).toBe(true)
  })

  it('sets launch at login and ignores invalid keys/values', async () => {
    const s = await invoke('system:set-settings', { launchAtLogin: true, bogus: true, startMinimized: 'yes' })
    expect(electron.app.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true })
    expect(s).toMatchObject({ launchAtLogin: true, startMinimized: false })
    await invoke('system:set-settings', null)
  })

  it('start minimized hides the window until ready, then minimizes it', async () => {
    await invoke('system:set-settings', { startMinimized: true })
    expect(sys.windowOptions()).toEqual({ show: false })
    const w = makeWindow()
    sys.attachWindow(w as any)
    w.events.get('ready-to-show')!()
    expect(w.showInactive).toHaveBeenCalled()
    expect(w.minimize).toHaveBeenCalled()
  })

  it('close to tray creates a tray, hides on close, and the menu drives playback', async () => {
    await invoke('system:set-settings', { closeToTray: true })
    expect(h.trays).toHaveLength(1)
    const tray = h.trays[0]
    sys.attachWindow(win as any)

    const e = { preventDefault: vi.fn() }
    win.events.get('close')!(e)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(win.hide).toHaveBeenCalled()

    // Start minimized + tray: stays hidden in the tray.
    const w2 = makeWindow()
    sys.attachWindow(w2 as any)
    w2.events.get('ready-to-show')!()
    expect(w2.showInactive).not.toHaveBeenCalled()

    await invoke('system:set-tray-labels', { playPause: 'Tocar', next: 'Próxima', previous: 'Anterior', show: 'Mostrar', quit: 'Sair' })
    const menu = h.menus.at(-1)!
    expect(menu.map((i: any) => i.label)).toEqual(['Tocar', 'Próxima', 'Anterior', undefined, 'Mostrar', 'Sair'])
    menu[0].click(); menu[1].click(); menu[2].click()
    expect(win.webContents.send.mock.calls).toEqual([['system:tray-command', 'playpause'], ['system:tray-command', 'next'], ['system:tray-command', 'previous']])
    menu[4].click()
    expect(win.restore).toHaveBeenCalled()
    expect(win.show).toHaveBeenCalled()
    tray.handlers.get('click')()
    expect(win.focus).toHaveBeenCalledTimes(2)

    await invoke('system:set-tray-labels', { bad: 1 })
    expect(h.menus.at(-1)![0].label).toBe('Tocar')

    menu[5].click()
    expect(electron.app.quit).toHaveBeenCalled()
    const e2 = { preventDefault: vi.fn() }
    win.events.get('close')!(e2)
    expect(e2.preventDefault).not.toHaveBeenCalled()
  })

  it('removes the tray when close to tray is turned off', async () => {
    await invoke('system:set-settings', { closeToTray: false })
    expect(h.trays[0].destroy).toHaveBeenCalled()
    await invoke('system:set-tray-labels', { playPause: 'a', next: 'b', previous: 'c', show: 'd', quit: 'e' })
    expect(h.menus).toHaveLength(0)
  })

  it('before-quit lets the window close; relaunch restarts the app', async () => {
    h.appHandlers.get('before-quit')!()
    await invoke('system:relaunch')
    expect(electron.app.relaunch).toHaveBeenCalled()
    expect(electron.app.quit).toHaveBeenCalled()
  })

  it('does nothing when there is no window', async () => {
    sys.setupSystem(() => null)
    await invoke('system:set-settings', { closeToTray: true })
    const menu = h.menus.at(-1)!
    expect(() => { menu[0].click(); menu[4].click() }).not.toThrow()
    await invoke('system:set-settings', { closeToTray: false })
  })
})
