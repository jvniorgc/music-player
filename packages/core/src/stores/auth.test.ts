import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../services/jellyfin', () => ({
  jellyfin: {
    authenticate: vi.fn(),
    clearAuth: vi.fn(),
    setAuth: vi.fn(),
    testConnection: vi.fn(),
    getCurrentUser: vi.fn(),
    uploadUserImage: vi.fn(),
    updateUserName: vi.fn(),
  },
}))

import { useAuthStore } from './auth'
import { jellyfin } from '../services/jellyfin'

const AUTH = { serverUrl: 'http://jf', token: 'TKN', userId: 'u1', username: 'me', serverId: 's1' }
const flush = () => new Promise(r => setTimeout(r, 0))

beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: false, isLoading: true, error: null, auth: null, primaryImageTag: null })
  vi.mocked(jellyfin.getCurrentUser).mockResolvedValue({ Id: 'u1', Name: 'me', PrimaryImageTag: 'pt' })
})

describe('login', () => {
  it('prepends http:// when the server url has no scheme and persists the session', async () => {
    vi.mocked(jellyfin.authenticate).mockResolvedValue(AUTH)
    await useAuthStore.getState().login('myserver:8096', 'me', 'pw')

    expect(jellyfin.authenticate).toHaveBeenCalledWith('http://myserver:8096', 'me', 'pw')
    expect(window.api.saveAuth).toHaveBeenCalledWith(AUTH)
    const s = useAuthStore.getState()
    expect(s.isAuthenticated).toBe(true)
    expect(s.auth).toEqual(AUTH)
    expect(s.isLoading).toBe(false)
    expect(s.error).toBeNull()
  })

  it('keeps an explicit https:// scheme', async () => {
    vi.mocked(jellyfin.authenticate).mockResolvedValue(AUTH)
    await useAuthStore.getState().login('https://secure:8920', 'me', 'pw')
    expect(jellyfin.authenticate).toHaveBeenCalledWith('https://secure:8920', 'me', 'pw')
  })

  it('records the error and stops loading on failure', async () => {
    vi.mocked(jellyfin.authenticate).mockRejectedValue(new Error('Invalid credentials'))
    await useAuthStore.getState().login('host', 'me', 'bad')
    const s = useAuthStore.getState()
    expect(s.isAuthenticated).toBe(false)
    expect(s.error).toBe('Invalid credentials')
    expect(s.isLoading).toBe(false)
  })
})

describe('logout', () => {
  it('clears jellyfin auth, persisted auth and store state', async () => {
    useAuthStore.setState({ isAuthenticated: true, auth: AUTH, primaryImageTag: 'pt' })
    await useAuthStore.getState().logout()
    expect(jellyfin.clearAuth).toHaveBeenCalled()
    expect(window.api.clearAuth).toHaveBeenCalled()
    const s = useAuthStore.getState()
    expect(s.isAuthenticated).toBe(false)
    expect(s.auth).toBeNull()
    expect(s.primaryImageTag).toBeNull()
  })
})

describe('restoreSession', () => {
  it('restores and verifies a saved session', async () => {
    vi.mocked(window.api.getAuth).mockResolvedValue({
      server_url: 'http://jf', token: 'TKN', user_id: 'u1', username: 'me', server_id: 's1',
    })
    vi.mocked(jellyfin.testConnection).mockResolvedValue(true)
    await useAuthStore.getState().restoreSession()

    expect(jellyfin.setAuth).toHaveBeenCalledWith(AUTH)
    const s = useAuthStore.getState()
    expect(s.isAuthenticated).toBe(true)
    expect(s.auth).toEqual(AUTH)
  })

  it('does not authenticate when the server is unreachable', async () => {
    vi.mocked(window.api.getAuth).mockResolvedValue({
      server_url: 'http://jf', token: 'TKN', user_id: 'u1', username: 'me', server_id: 's1',
    })
    vi.mocked(jellyfin.testConnection).mockResolvedValue(false)
    await useAuthStore.getState().restoreSession()
    const s = useAuthStore.getState()
    expect(s.isAuthenticated).toBe(false)
    expect(s.isLoading).toBe(false)
  })

  it('stops loading when restoring the session throws', async () => {
    vi.mocked(window.api.getAuth).mockRejectedValue(new Error('db gone'))
    await useAuthStore.getState().restoreSession()
    const s = useAuthStore.getState()
    expect(s.isAuthenticated).toBe(false)
    expect(s.isLoading).toBe(false)
  })

  it('stops loading when there is no saved session', async () => {
    vi.mocked(window.api.getAuth).mockResolvedValue(null)
    await useAuthStore.getState().restoreSession()
    expect(useAuthStore.getState().isLoading).toBe(false)
  })
})

describe('refreshUserInfo & updateProfile', () => {
  it('refreshUserInfo pulls the primary image tag and username', async () => {
    useAuthStore.setState({ auth: AUTH })
    await useAuthStore.getState().refreshUserInfo()
    expect(useAuthStore.getState().primaryImageTag).toBe('pt')
  })

  it('refreshUserInfo clears the tag when absent and leaves a null auth untouched', async () => {
    vi.mocked(jellyfin.getCurrentUser).mockResolvedValue({ Id: 'u1', Name: 'me' })
    useAuthStore.setState({ auth: null, primaryImageTag: 'old' })
    await useAuthStore.getState().refreshUserInfo()
    const s = useAuthStore.getState()
    expect(s.primaryImageTag).toBeNull()
    expect(s.auth).toBeNull()
  })

  it('refreshUserInfo swallows errors from the server', async () => {
    vi.mocked(jellyfin.getCurrentUser).mockRejectedValue(new Error('500'))
    useAuthStore.setState({ auth: AUTH, primaryImageTag: 'keep' })
    await expect(useAuthStore.getState().refreshUserInfo()).resolves.toBeUndefined()
    expect(useAuthStore.getState().primaryImageTag).toBe('keep')
  })

  it('updateProfile uploads image, renames, and persists the new name', async () => {
    vi.mocked(jellyfin.getCurrentUser).mockResolvedValue({ Id: 'u1', Name: 'NewName', PrimaryImageTag: 'pt' })
    useAuthStore.setState({ auth: AUTH })
    const blob = new Blob(['x'])
    await useAuthStore.getState().updateProfile('NewName', blob)

    expect(jellyfin.uploadUserImage).toHaveBeenCalledWith(blob)
    expect(jellyfin.updateUserName).toHaveBeenCalledWith('NewName')
    expect(window.api.saveAuth).toHaveBeenCalledWith({ ...AUTH, username: 'NewName' })
    // refreshUserInfo re-pulls the username from the server after the rename.
    expect(useAuthStore.getState().auth?.username).toBe('NewName')
    await flush()
  })
})
