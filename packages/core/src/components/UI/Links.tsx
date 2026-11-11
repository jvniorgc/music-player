import { Fragment, type MouseEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { JellyfinItem } from '../../services/jellyfin'
import { usePlayerStore } from '../../stores/player'
import { contextPath } from '../../lib/playbackContext'

const LINK_CLASS = 'hover:underline hover:text-text-primary cursor-pointer'

/** Navigate without triggering the surrounding row/card click; closes the full-screen player. */
function useLinkNavigate() {
  const navigate = useNavigate()
  return (e: MouseEvent, to: string) => {
    e.stopPropagation()
    e.preventDefault()
    if (usePlayerStore.getState().showFullScreen) usePlayerStore.getState().setShowFullScreen(false)
    navigate(to)
  }
}

/** Linked artists of a track/album: one link per artist, comma separated. */
export function ArtistLinks({ item, fallback = '', className = '' }: {
  item: Pick<JellyfinItem, 'ArtistItems' | 'AlbumArtists' | 'Artists' | 'AlbumArtist'> | null | undefined
  fallback?: string
  className?: string
}) {
  const go = useLinkNavigate()
  const artists = item?.ArtistItems?.length ? item.ArtistItems : item?.AlbumArtists
  if (!artists?.length) {
    const text = item?.Artists?.join(', ') || item?.AlbumArtist || fallback
    return text ? <span className={className}>{text}</span> : null
  }
  return (
    <span className={className}>
      {artists.map((a, i) => (
        <Fragment key={`${a.Id}-${i}`}>
          {i > 0 && ', '}
          <a href={`#/artist/${a.Id}`} className={LINK_CLASS} onClick={e => go(e, `/artist/${a.Id}`)}>
            {a.Name}
          </a>
        </Fragment>
      ))}
    </span>
  )
}

/** Link to a track's album; plain text when the album id is unknown. */
export function AlbumLink({ item, className = '', children }: {
  item: Pick<JellyfinItem, 'AlbumId' | 'Album'> | null | undefined
  className?: string
  children?: ReactNode
}) {
  const go = useLinkNavigate()
  const label = children ?? item?.Album
  if (!label) return null
  if (!item?.AlbumId) return <span className={className}>{label}</span>
  const to = `/album/${item.AlbumId}`
  return (
    <a href={`#${to}`} className={`${LINK_CLASS} ${className}`} onClick={e => go(e, to)}>
      {label}
    </a>
  )
}

/** "Artist A, Artist B — Album" with every part linked. */
export function TrackSubtitle({ item, showAlbum = true, fallback = 'Unknown artist' }: {
  item: JellyfinItem
  showAlbum?: boolean
  fallback?: string
}) {
  return (
    <>
      <ArtistLinks item={item} fallback={fallback} />
      {showAlbum && item.Album && <> — <AlbumLink item={item} /></>}
    </>
  )
}

/** "Playing from <context>", linking to the context's page when it has one. */
export function PlayingFrom({ className = '' }: { className?: string }) {
  const context = usePlayerStore(s => s.context)
  const go = useLinkNavigate()
  if (!context?.name) return null
  const to = contextPath(context)
  return (
    <p className={`text-xs text-text-tertiary truncate ${className}`}>
      Playing from{' '}
      {to ? (
        <a href={`#${to}`} className={`${LINK_CLASS} text-text-secondary font-medium`} onClick={e => go(e, to)}>
          {context.name}
        </a>
      ) : (
        <span className="text-text-secondary font-medium">{context.name}</span>
      )}
    </p>
  )
}
