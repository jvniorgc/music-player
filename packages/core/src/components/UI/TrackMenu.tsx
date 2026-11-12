import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListEnd, ListStart, ListPlus, Radio, User, Disc3, X, Send, Heart } from 'lucide-react'
import type { JellyfinItem } from '../../services/jellyfin'
import { usePlayerStore } from '../../stores/player'
import { useLibraryStore } from '../../stores/library'
import { useToastStore } from '../../stores/toast'
import { useLikesStore } from '../../stores/likes'
import { MoreMenu, type MenuEntry } from './Menu'
import AddToPlaylist from './AddToPlaylist'
import { t, useT } from '../../i18n'
import { isConfigured } from '../../services/social'
import { itemFromJellyfin, type RecItem } from '../../services/friendRecs'
import RecommendModal from '../Inbox/RecommendModal'

/** Menu strings, resolved in the current language on each access. */
export const MENU_TEXT = {
  get play() { return t('menu.play') },
  get shuffle() { return t('menu.shuffle') },
  get playNext() { return t('menu.playNext') },
  get addToQueue() { return t('menu.addToQueue') },
  get startRadio() { return t('menu.startRadio') },
  get goToArtist() { return t('menu.goToArtist') },
  goToNamedArtist: (name: string) => t('menu.goToNamedArtist', { name }),
  get goToAlbum() { return t('menu.goToAlbum') },
  get addToPlaylist() { return t('menu.addToPlaylist') },
  get removeFromPlaylist() { return t('menu.removeFromPlaylist') },
  get removeFromQueue() { return t('menu.removeFromQueue') },
  get willPlayNext() { return t('menu.willPlayNext') },
  get addedToQueue() { return t('menu.addedToQueue') },
  get radioFailed() { return t('menu.radioFailed') },
}

export function useGoTo() {
  const navigate = useNavigate()
  return (to: string) => {
    const p = usePlayerStore.getState()
    if (p.showFullScreen) p.setShowFullScreen(false)
    navigate(to)
  }
}

/** "Go to artist" entries: one per linked artist (labelled by name when several). */
export function artistEntries(item: Pick<JellyfinItem, 'ArtistItems' | 'AlbumArtists'>, goTo: (to: string) => void): MenuEntry[] {
  const artists = item.ArtistItems?.length ? item.ArtistItems : item.AlbumArtists ?? []
  return artists.slice(0, 5).map(a => ({
    label: artists.length > 1 ? MENU_TEXT.goToNamedArtist(a.Name) : MENU_TEXT.goToArtist,
    icon: User,
    onSelect: () => goTo(`/artist/${a.Id}`),
  }))
}

export interface TrackMenuProps {
  track: JellyfinItem
  /** Adds a destructive "Remove from …" entry. */
  onRemove?: () => void
  removeLabel?: string
  /** Hide "Go to album" (e.g. inside that album). */
  hideAlbum?: boolean
  className?: string
}

/** Standard track context menu: "..." button plus right-click on the surrounding row. */
export default function TrackMenu({ track, onRemove, removeLabel, hideAlbum, className }: TrackMenuProps) {
  useT()
  const [pickerSong, setPickerSong] = useState<JellyfinItem | null>(null)
  const [recItem, setRecItem] = useState<RecItem | null>(null)
  const toast = useToastStore(s => s.show)
  const goTo = useGoTo()

  const entries = (): MenuEntry[] => {
    const p = usePlayerStore.getState()
    const likes = useLikesStore.getState()
    const liked = likes.liked[track.Id] ?? track.UserData?.IsFavorite ?? false
    return [
      { label: MENU_TEXT.playNext, icon: ListStart, onSelect: () => { p.addNext(track); toast(MENU_TEXT.willPlayNext, 'success') } },
      { label: MENU_TEXT.addToQueue, icon: ListEnd, onSelect: () => { p.addToQueue(track); toast(MENU_TEXT.addedToQueue, 'success') } },
      { label: MENU_TEXT.startRadio, icon: Radio, onSelect: () => { p.startTrackRadio(track).catch(() => toast(MENU_TEXT.radioFailed, 'error')) } },
      'separator',
      ...artistEntries(track, goTo),
      !hideAlbum && track.AlbumId && { label: MENU_TEXT.goToAlbum, icon: Disc3, onSelect: () => goTo(`/album/${track.AlbumId}`) },
      'separator',
      {
        label: MENU_TEXT.addToPlaylist, icon: ListPlus, onSelect: () => {
          const lib = useLibraryStore.getState()
          if (lib.playlists.length === 0) lib.fetchPlaylists()
          setPickerSong(track)
        },
      },
      { label: liked ? t('like.unlike') : t('like.like'), icon: Heart, onSelect: () => { void likes.toggle(track.Id) } },
      isConfigured() && { label: t('inbox.recommend'), icon: Send, onSelect: () => setRecItem(itemFromJellyfin(track)) },
      onRemove && 'separator',
      onRemove && { label: removeLabel ?? MENU_TEXT.removeFromPlaylist, icon: X, danger: true, onSelect: onRemove },
    ]
  }

  return (
    <>
      <MoreMenu entries={entries} className={className} />
      <AddToPlaylist song={pickerSong} onClose={() => setPickerSong(null)} />
      <RecommendModal item={recItem} onClose={() => setRecItem(null)} />
    </>
  )
}
