import { X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { jellyfin } from '../../services/jellyfin'
import type { AlbumPick } from '../../services/picks'
import CoverArt from '../UI/CoverArt'
import { useT } from '../../i18n'

export default function PickCard({ pick, mine, onRemove }: { pick: AlbumPick; mine?: boolean; onRemove?: () => void }) {
  const { t } = useT()
  const navigate = useNavigate()
  return (
    <div className="relative group w-40 shrink-0">
      <button onClick={() => navigate(`/album/${pick.albumId}`)} className="text-left w-full">
        <CoverArt src={jellyfin.getImageUrl(pick.albumId, undefined, 300)} alt={pick.albumName} kind="album"
          className="aspect-square rounded-md overflow-hidden bg-surface-2 mb-2" />
        <div className="text-sm font-medium text-text-primary truncate">{pick.albumName}</div>
        <div className="text-xs text-text-secondary truncate">{pick.artist}</div>
      </button>
      <div className="text-xs text-accent mt-1 truncate">{mine ? t('picks.yours') : pick.user.name}</div>
      {pick.note && <p className="text-xs text-text-tertiary italic line-clamp-2 break-words">{pick.note}</p>}
      {onRemove && (
        <button onClick={onRemove} aria-label={t('picks.remove')} title={t('picks.remove')}
          className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity">
          <X size={14} />
        </button>
      )}
    </div>
  )
}
