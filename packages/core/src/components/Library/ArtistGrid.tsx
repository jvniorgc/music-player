import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useLibraryStore } from '../../stores/library'
import { getScrollParent } from '../../lib/scroll'
import { gridColumns } from '../../lib/grid'
import { Loader2 } from 'lucide-react'
import { ArtistCard } from '../UI/MediaCard'
import { useShallow } from 'zustand/react/shallow'

const GAP = 20
const MIN_CARD = 160
const CAPTION_HEIGHT = 56

export default function ArtistGrid() {
  const { artists, totalArtists, isLoading, fetchArtists } = useLibraryStore(useShallow(s => ({ artists: s.artists, totalArtists: s.totalArtists, isLoading: s.isLoading, fetchArtists: s.fetchArtists })))
  const navigate = useNavigate()
  const gridRef = useRef<HTMLDivElement>(null)
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null)
  const [scrollMargin, setScrollMargin] = useState(0)
  const [width, setWidth] = useState(0)

  const columns = gridColumns(width, MIN_CARD, GAP)
  const cardWidth = width > 0 ? (width - GAP * (columns - 1)) / columns : MIN_CARD
  const rowCount = Math.ceil(artists.length / columns)

  // Large libraries can have thousands of artists; only rows near the viewport are mounted.
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollEl,
    estimateSize: () => cardWidth + CAPTION_HEIGHT + GAP,
    overscan: 3,
    scrollMargin,
  })

  useLayoutEffect(() => {
    const grid = gridRef.current
    const parent = getScrollParent(grid)
    setScrollEl(parent)
    if (!grid || !parent) return
    const update = () => {
      setWidth(grid.clientWidth)
      setScrollMargin(grid.getBoundingClientRect().top - parent.getBoundingClientRect().top + parent.scrollTop)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(parent)
    ro.observe(grid)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    virtualizer.measure()
  }, [columns, cardWidth])

  useEffect(() => {
    if (artists.length === 0) fetchArtists()
  }, [])

  return (
    <div className="fade-in">
      <div className="mb-6">
        <h1 className="text-title font-semibold">Artists</h1>
        {totalArtists > 0 && (
          <p className="text-sm text-text-secondary mt-1">{totalArtists} artists</p>
        )}
      </div>

      <div ref={gridRef} className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(row => {
          const rowItems = artists.slice(row.index * columns, row.index * columns + columns)
          return (
            <div
              key={row.key}
              data-index={row.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full grid"
              style={{
                transform: `translateY(${row.start - scrollMargin}px)`,
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                columnGap: GAP,
                paddingBottom: GAP,
              }}
            >
              {rowItems.map(artist => (
                <ArtistCard
                  key={artist.Id}
                  item={artist}
                  onClick={() => navigate(`/artist/${artist.Id}`)}
                  subtitle={artist.AlbumCount ? `${artist.AlbumCount} albums` : undefined}
                />
              ))}
            </div>
          )
        })}
      </div>

      {isLoading && (
        <div className="py-8 flex justify-center">
          <Loader2 size={24} className="animate-spin text-text-tertiary" />
        </div>
      )}
    </div>
  )
}
