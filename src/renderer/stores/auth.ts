import { create } from 'zustand'
import { JellyfinAuth, jellyfin } from '../services/jellyfin'

interface AuthState {
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  auth: JellyfinAuth | null
  primaryImageTag: string | null
  login: (serverUrl: string, username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  restoreSession: () => Promise<void>
  refreshUserInfo: () => Promise<void>
  updateProfile: (name?: string, imageBlob?: Blob) => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  isLoading: true,
  error: null,
  auth: null,
  primaryImageTag: null,

  login: async (serverUrl, username, password) => {
    set({ isLoading: true, error: null })
    try {
      const protocol = serverUrl.match(/^https?:\/\//) ? '' : 'http://'
      const fullUrl = `${protocol}${serverUrl}`
      const auth = await jellyfin.authenticate(fullUrl, username, password)
      await window.api.saveAuth(auth)
      set({ isAuthenticated: true, auth, isLoading: false, primaryImageTag: null })
      get().refreshUserInfo()
    } catch (err: any) {
      set({ error: err.message, isLoading: false })
    }
  },

  logout: async () => {
    jellyfin.clearAuth()
    await window.api.clearAuth()
    set({ isAuthenticated: false, auth: null, primaryImageTag: null })
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
          set({ isAuthenticated: true, auth, isLoading: false })
          get().refreshUserInfo()
          return
        }
      }
    } catch {}
    set({ isLoading: false })
  },

  refreshUserInfo: async () => {
    try {
      const user = await jellyfin.getCurrentUser()
      set(state => ({
        primaryImageTag: user.PrimaryImageTag || null,
        auth: state.auth ? { ...state.auth, username: user.Name } : state.auth
      }))
    } catch {}
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
