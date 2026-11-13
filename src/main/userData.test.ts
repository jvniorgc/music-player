import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const h = vi.hoisted(() => ({ appData: '', packaged: true, setPath: vi.fn() }))
vi.mock('electron', () => ({
  app: {
    getPath: () => h.appData,
    get isPackaged() { return h.packaged },
    setPath: h.setPath,
  },
}))

import { keepLegacyUserData } from './userData'

beforeEach(() => {
  h.appData = mkdtempSync(join(tmpdir(), 'appdata-'))
  h.setPath.mockClear()
})

describe('keepLegacyUserData', () => {
  it('keeps using the pre-rename data folder when it exists', () => {
    mkdirSync(join(h.appData, 'Jellyfin Music Player'))
    keepLegacyUserData()
    expect(h.setPath).toHaveBeenCalledWith('userData', join(h.appData, 'Jellyfin Music Player'))
  })

  it('uses the dev folder name when unpackaged', () => {
    h.packaged = false
    mkdirSync(join(h.appData, 'jellyfin-music-player'))
    keepLegacyUserData()
    expect(h.setPath).toHaveBeenCalledWith('userData', join(h.appData, 'jellyfin-music-player'))
    h.packaged = true
  })

  it('leaves the default (Musga) folder for fresh installs', () => {
    keepLegacyUserData()
    expect(h.setPath).not.toHaveBeenCalled()
  })
})
