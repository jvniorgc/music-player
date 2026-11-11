import { useState } from 'react'
import { ListEnd, ListStart, ListPlus, Play, Shuffle } from 'lucide-react'
import { jellyfin, type JellyfinItem } from '../../services/jellyfin'
import { usePlayerStore } from '../../stores/player'
import { useLibraryStore } from '../../stores/library'
import { useToastStore } from '../../stores/toast'
import { MoreMenu, type MenuEntry } from './Menu'
import AddToPlaylist from './AddToPlaylist'
import { MENU_TEXT, artistEntries, useGoTo } from './TrackMenu'

/** Album actions for cards and headers. Pass `tracks` when already loaded to skip the fetch. */
export function useAlbumEntries(album: JellyfinItem, tracks?: JellyfinItem[]) {
  const [pickerSongs, setPickerSongs] = useState<JellyfinItem[] | null>(null)
  const toast = useToastStore(s => s.show)
  const goTo = useGoTo()
  const ctx = { type: 'album' as const, id: album.Id, name: album.Name }

  const withTracks = (fn: (items: JellyfinItem[]) => void) => async () => {
    try {
      const items = tracks ?? (await jellyfin.getAlbumItems(album.Id)).Items
      if (items.length > 0) fn(items)
    } catch (err) {
      console.error('[AlbumMenu] failed to load album tracks', err)
      toast('Could not load this album', 'error')
    }
  }

  const entries = (opts: { includePlay?: boolean } = {}): MenuEntry[] => {
    const p = usePlayerStore.getState()
    return [
      opts.includePlay && { label: MENU_TEXT.play, icon: Play, onSelect: withTracks(items => p.playItems(items, 0, ctx)) },
      opts.includePlay && { label: MENU_TEXT.shuffle, icon: Shuffle, onSelect: withTracks(items => p.shuffleItems(items, ctx)) },
      { label: MENU_TEXT.playNext, icon: ListStart, onSelect: withTracks(items => { p.addItemsNext(items); toast(MENU_TEXT.willPlayNext, 'success') }) },
      { label: MENU_TEXT.addToQueue, icon: ListEnd, onSelect: withTracks(items => { p.addItemsToQueue(items); toast(MENU_TEXT.addedToQueue, 'success') }) },
      'separator',
      ...artistEntries(album, goTo),
      'separator',
      {
        label: MENU_TEXT.addToPlaylist, icon: ListPlus, onSelect: withTracks(items => {
          const lib = useLibraryStore.getState()
          if (lib.playlists.length === 0) lib.fetchPlaylists()
          setPickerSongs(items)
        }),
      },
    ]
  }

  const picker = <AddToPlaylist song={pickerSongs} onClose={() => setPickerSongs(null)} />
  return { entries, picker }
}

/** "..." menu on album cards (also opened by right-clicking the card). */
export default function AlbumMenu({ album }: { album: JellyfinItem }) {
  const { entries, picker } = useAlbumEntries(album)
  return (
    <>
      <MoreMenu
        entries={() => entries({ includePlay: true })}
        className="w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 transition-opacity"
        size={16}
      />
      {picker}
    </>
  )
}

/** Header "more" menu for album pages (play/shuffle are separate buttons there). */
export function AlbumHeaderMenu({ album, tracks }: { album: JellyfinItem; tracks: JellyfinItem[] }) {
  const { entries, picker } = useAlbumEntries(album, tracks)
  return (
    <>
      <MoreMenu
        entries={() => entries()}
        className="w-8 h-8 inline-flex items-center justify-center rounded-full border border-border text-text-secondary hover:text-text-primary hover:bg-white/10 transition-colors"
      />
      {picker}
    </>
  )
}
