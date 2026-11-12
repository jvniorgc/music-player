import { useState } from 'react'
import { Star } from 'lucide-react'
import type { JellyfinItem } from '../../services/jellyfin'
import { isConfigured } from '../../services/social'
import { getCurrentPicks, setMyPick, MAX_PICK_NOTE, type AlbumPick } from '../../services/picks'
import { useToastStore } from '../../stores/toast'
import { ConfirmModal, InputModal } from '../UI/Modal'
import type { MenuItem } from '../UI/Menu'
import { useT } from '../../i18n'

/** Window event fired after the user's weekly pick changes (the Home row listens). */
export const PICKS_CHANGED = 'picks:changed'

/** "Pick as my album of the week" menu entry plus its confirm/note modals. */
export function usePickAlbum(album: JellyfinItem): { entry: MenuItem | false; modals: React.ReactNode } {
  const { t } = useT()
  const toast = useToastStore(s => s.show)
  const [replacing, setReplacing] = useState<AlbumPick | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [initialNote, setInitialNote] = useState('')

  const start = async () => {
    const mine = await getCurrentPicks().then(w => w.mine, () => null)
    setInitialNote(mine?.albumId === album.Id ? mine.note ?? '' : '')
    if (mine && mine.albumId !== album.Id) setReplacing(mine)
    else setNoteOpen(true)
  }

  const save = async (note: string) => {
    try {
      await setMyPick({
        albumId: album.Id, albumName: album.Name, artist: album.AlbumArtist || album.Artists?.[0] || '—',
        year: album.ProductionYear ? String(album.ProductionYear) : undefined, note: note.slice(0, MAX_PICK_NOTE) || undefined,
      })
      toast(t('picks.saved'), 'success')
      window.dispatchEvent(new Event(PICKS_CHANGED))
    } catch {
      toast(t('picks.failed'), 'error')
    }
  }

  const modals = (
    <>
      <ConfirmModal
        open={!!replacing} title={t('picks.replaceTitle')} confirmLabel={t('picks.replace')}
        message={t('picks.replaceMessage', { album: replacing?.albumName ?? '' })}
        onClose={() => setReplacing(null)} onConfirm={() => setNoteOpen(true)}
      />
      <InputModal
        open={noteOpen} title={t('picks.noteTitle')} placeholder={t('picks.notePlaceholder')} initialValue={initialNote}
        confirmLabel={t('picks.save')} allowEmpty onClose={() => setNoteOpen(false)} onConfirm={save}
      />
    </>
  )
  return { entry: isConfigured() && { label: t('picks.pickAction'), icon: Star, onSelect: start }, modals }
}
