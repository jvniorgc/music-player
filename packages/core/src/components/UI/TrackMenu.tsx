import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListEnd, ListStart, ListPlus, Radio, User, Disc3, X } from 'lucide-react'
import type { JellyfinItem } from '../../services/jellyfin'
import { usePlayerStore } from '../../stores/player'
import { useLibraryStore } from '../../stores/library'
import { useToastStore } from '../../stores/toast'
import { MoreMenu, type MenuEntry } from './Menu'
import AddToPlaylist from './AddToPlaylist'

/** Menu strings, kept together for later extraction (i18n). */
export const MENU_TEXT = {
  play: 'Play',
  shuffle: 'Shuffle',
  playNext: 'Play next',
  addToQueue: 'Add to queue',
  startRadio: 'Start radio',
  goToArtist: 'Go to artist',
  goToNamedArtist: (name: string) => `Go to ${name}`,
  goToAlbum: 'Go to album',
  addToPlaylist: 'Add to playlist',
  removeFromPlaylist: 'Remove from playlist',
  removeFromQueue: 'Remove from queue',
  willPlayNext: 'Will play next',
  addedToQueue: 'Added to queue',
  radioFailed: 'Could not start radio',
} as const

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
export default function TrackMenu({ track, onRemove, removeLabel = MENU_TEXT.removeFromPlaylist, hideAlbum, className }: TrackMenuProps) {
  const [pickerSong, setPickerSong] = useState<JellyfinItem | null>(null)
  const toast = useToastStore(s => s.show)
  const goTo = useGoTo()

  const entries = (): MenuEntry[] => {
    const p = usePlayerStore.getState()
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
      onRemove && 'separator',
      onRemove && { label: removeLabel, icon: X, danger: true, onSelect: onRemove },
    ]
  }

  return (
    <>
      <MoreMenu entries={entries} className={className} />
      <AddToPlaylist song={pickerSong} onClose={() => setPickerSong(null)} />
    </>
  )
}
