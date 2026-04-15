import { create } from 'zustand'
import { JellyfinAuth, jellyfin } from '../services/jellyfin'

interface AuthState {
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  auth: JellyfinAuth | null
  login: (serverUrl: string, username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  restoreSession: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isLoading: true,
  error: null,
  auth: null,

  login: async (serverUrl, username, password) => {
    set({ isLoading: true, error: null })
    try {
      const protocol = serverUrl.match(/^https?:\/\//) ? '' : 'http://'
      const fullUrl = `${protocol}${serverUrl}`
      const auth = await jellyfin.authenticate(fullUrl, username, password)
      await window.api.saveAuth(auth)
      set({ isAuthenticated: true, auth, isLoading: false })
    } catch (err: any) {
      set({ error: err.message, isLoading: false })
    }
  },

  logout: async () => {
    jellyfin.clearAuth()
    await window.api.clearAuth()
    set({ isAuthenticated: false, auth: null })
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
          return
        }
      }
    } catch {}
    set({ isLoading: false })
  }
}))
