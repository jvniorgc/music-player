import { create } from 'zustand'
import { jellyfin, type JellyfinItem } from '../services/jellyfin'
import { useToastStore } from './toast'
import { t } from '../i18n'

interface LikesState {
  /** Known liked state by item id (absent = unknown, treated as not liked). */
  liked: Record<string, boolean>
  /** Records `UserData.IsFavorite` for items not seen yet. */
  seed: (items: Pick<JellyfinItem, 'Id' | 'UserData'>[]) => void
  isLiked: (id: string) => boolean
  /** Optimistic like/unlike; rolls back with an error toast on failure. Resolves to success. */
  toggle: (id: string) => Promise<boolean>
  /** Fetches the liked state of an item whose state is unknown. */
  ensure: (id: string) => Promise<void>
}

const requested = new Set<string>()

export const useLikesStore = create<LikesState>((set, get) => ({
  liked: {},

  seed: (items) => {
    const known = get().liked
    const add: Record<string, boolean> = {}
    for (const it of items) {
      if (it.Id in known || it.UserData?.IsFavorite === undefined) continue
      add[it.Id] = it.UserData.IsFavorite
    }
    if (Object.keys(add).length) set(s => ({ liked: { ...s.liked, ...add } }))
  },

  isLiked: (id) => !!get().liked[id],

  toggle: async (id) => {
    const prev = get().isLiked(id)
    set(s => ({ liked: { ...s.liked, [id]: !prev } }))
    try {
      await jellyfin.toggleFavorite(id, prev)
      return true
    } catch (err) {
      console.error('Failed to toggle like:', err)
      set(s => ({ liked: { ...s.liked, [id]: prev } }))
      useToastStore.getState().show(t('like.failed'), 'error')
      return false
    }
  },

  ensure: async (id) => {
    if (id in get().liked || requested.has(id)) return
    requested.add(id)
    try {
      get().seed([await jellyfin.getItem(id)])
    } catch { requested.delete(id) }
  },
}))

jellyfin.onFavoriteChanged((id, isFavorite) => {
  useLikesStore.setState(s => ({ liked: { ...s.liked, [id]: isFavorite } }))
})
