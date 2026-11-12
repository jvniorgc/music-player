import { normalizeServerUrl, friendlyLoginError, saveLastLogin } from '../lib/url'
import { create } from 'zustand'
import { JellyfinAuth, jellyfin } from '../services/jellyfin'

interface AuthState {
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  auth: JellyfinAuth | null
  primaryImageTag: string | null
  /** Jellyfin `Policy.IsAdministrator`; false until known (persisted per user to avoid flicker). */
  isAdmin: boolean
  login: (serverUrl: string, username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  restoreSession: () => Promise<void>
  refreshUserInfo: () => Promise<void>
  updateProfile: (name?: string, imageBlob?: Blob) => Promise<void>
}

const adminKey = (userId: string) => `isAdmin:${userId}`

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  isLoading: true,
  error: null,
  auth: null,
  primaryImageTag: null,
  isAdmin: false,

  login: async (serverUrl, username, password) => {
    set({ isLoading: true, error: null })
    try {
      const fullUrl = normalizeServerUrl(serverUrl)
      saveLastLogin(fullUrl, username.trim())
      // Desktop: allow cross-origin calls to this server even behind a proxy without CORS.
      await window.api.allowOrigin?.(fullUrl).catch(err => console.warn('[auth] allowOrigin failed', err))
      const auth = await jellyfin.authenticate(fullUrl, username.trim(), password)
      await window.api.saveAuth(auth)
      set({ isAuthenticated: true, auth, isLoading: false, primaryImageTag: null, isAdmin: false })
      get().refreshUserInfo()
    } catch (err: any) {
      set({ error: friendlyLoginError(err), isLoading: false })
    }
  },

  logout: async () => {
    jellyfin.clearAuth()
    await window.api.clearAuth()
    set({ isAuthenticated: false, auth: null, primaryImageTag: null, isAdmin: false })
  },

  restoreSession: async () => {
    try {
      const saved = await window.api.getAuth()
      if (saved) {
        const auth: JellyfinAuth = {
          serverUrl: saved.server_url,
          token: saved.token,
          userId: saved.user_id,
          username: saved.username,
          serverId: saved.server_id
        }
        jellyfin.setAuth(auth)
        const connected = await jellyfin.testConnection(auth.serverUrl)
        if (connected) {
          const savedAdmin = await window.api.getSetting(adminKey(auth.userId)).catch(() => null)
          set({ isAuthenticated: true, auth, isLoading: false, isAdmin: savedAdmin === 'true' })
          get().refreshUserInfo()
          return
        }
      }
    } catch (err) {
      console.warn('[auth] session restore failed', err)
    }
    set({ isLoading: false })
  },

  refreshUserInfo: async () => {
    try {
      const user = await jellyfin.getCurrentUser()
      const isAdmin = user.Policy?.IsAdministrator === true
      set(state => ({
        isAdmin,
        primaryImageTag: user.PrimaryImageTag || null,
        auth: state.auth ? { ...state.auth, username: user.Name } : state.auth
      }))
      window.api.setSetting(adminKey(user.Id), String(isAdmin)).catch(() => {})
    } catch (err) {
      console.warn('[auth] failed to refresh user info', err)
    }
  },

  updateProfile: async (name?: string, imageBlob?: Blob) => {
    if (imageBlob) {
      await jellyfin.uploadUserImage(imageBlob)
    }
    if (name) {
      await jellyfin.updateUserName(name)
      const { auth } = get()
      if (auth) {
        const updated = { ...auth, username: name }
        await window.api.saveAuth(updated)
        set({ auth: updated })
      }
    }
    await get().refreshUserInfo()
  }
}))

export const useIsAdmin = () => useAuthStore(s => s.isAdmin)

export const SESSION_EXPIRED_MESSAGE = 'login.error.sessionExpired'

// Central 401 handling: any authenticated request that comes back 401 drops
// the session and sends the user back to the login screen with a message.
jellyfin.onUnauthorized(() => {
  window.api.clearAuth().catch(err => console.warn('[auth] failed to clear stored auth', err))
  useAuthStore.setState({ isAuthenticated: false, auth: null, primaryImageTag: null, isAdmin: false, isLoading: false, error: SESSION_EXPIRED_MESSAGE })
})
