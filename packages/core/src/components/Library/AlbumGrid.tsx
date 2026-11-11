import { useEffect, useRef, useCallback, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { jellyfin, JellyfinItem } from '../../services/jellyfin'
import { Loader2 } from 'lucide-react'
import { AlbumCard } from '../UI/MediaCard'

type SortOption = 'alphabetical' | 'recent'

const PAGE_SIZE = 60
// How many pages to keep in memory around the current viewport
const KEEP_PAGES = 3

function getSortParams(sort: SortOption): { sortBy: string; sortOrder: string } {
  return sort === 'recent'
    ? { sortBy: 'DateCreated', sortOrder: 'Descending' }
    : { sortBy: 'SortName', sortOrder: 'Ascending' }
}

export default function AlbumGrid() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialSort = searchParams.get('sort') === 'recent' ? 'recent' : 'alphabetical'
  const [sort, setSort] = useState<SortOption>(initialSort)
  const [totalAlbums, setTotalAlbums] = useState(0)
  const [pages, setPages] = useState<Map<number, JellyfinItem[]>>(new Map())
  const [loadingPages, setLoadingPages] = useState<Set<number>>(new Set())
  const containerRef = useRef<HTMLDivElement>(null)
  const sentinelRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  // Fetch total count on mount and sort change
  useEffect(() => {
    setPages(new Map())
    setLoadingPages(new Set())
    const { sortBy, sortOrder } = getSortParams(sort)
    jellyfin.getAlbums(0, 0, sortBy, sortOrder).then(res => {
      setTotalAlbums(res.TotalRecordCount)
    })
    // Load first page immediately
    loadPage(0)
  }, [sort])

  const totalPages = Math.ceil(totalAlbums / PAGE_SIZE)

  const loadPage = useCallback(async (pageIndex: number) => {
    setLoadingPages(prev => {
      if (prev.has(pageIndex)) return prev
      const next = new Set(prev)
      next.add(pageIndex)
      return next
    })
    const { sortBy, sortOrder } = getSortParams(sort)
    try {
      const res = await jellyfin.getAlbums(pageIndex * PAGE_SIZE, PAGE_SIZE, sortBy, sortOrder)
      setTotalAlbums(res.TotalRecordCount)
      setPages(prev => {
        const next = new Map(prev)
        next.set(pageIndex, res.Items)
        return next
      })
    } finally {
      setLoadingPages(prev => {
        const next = new Set(prev)
        next.delete(pageIndex)
        return next
      })
    }
  }, [sort])

  // Evict pages far from a given page index
  const evictDistantPages = useCallback((currentPage: number) => {
    setPages(prev => {
      let changed = false
      const next = new Map(prev)
      for (const key of next.keys()) {
        if (Math.abs(key - currentPage) > KEEP_PAGES) {
          next.delete(key)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [])

  // Observe page sentinels entering viewport to trigger loads + evictions
  useEffect(() => {
    if (totalPages === 0) return
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const pageIndex = Number(entry.target.getAttribute('data-page'))
            if (!isNaN(pageIndex)) {
              if (!pages.has(pageIndex) && !loadingPages.has(pageIndex)) {
                loadPage(pageIndex)
              }
              evictDistantPages(pageIndex)
            }
          }
        }
      },
      { rootMargin: '400px' }
    )
    sentinelRefs.current.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [totalPages, pages, loadingPages, loadPage, evictDistantPages])

  const isLoading = loadingPages.size > 0 && pages.size === 0

  return (
    <div className="fade-in" ref={containerRef}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-title font-semibold">Albums</h1>
          {totalAlbums > 0 && (
            <p className="text-sm text-text-secondary mt-1">{totalAlbums} albums</p>
          )}
        </div>
        <select
          value={sort}
          onChange={e => setSort(e.target.value as SortOption)}
          className="bg-surface-2 border border-border rounded-sm px-3 h-8 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="alphabetical">A–Z</option>
          <option value="recent">Recently added</option>
        </select>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-text-tertiary" />
        </div>
      )}

      {Array.from({ length: totalPages }, (_, pageIndex) => (
        <div key={`${sort}-${pageIndex}`}>
          <div
            ref={el => { if (el) sentinelRefs.current.set(pageIndex, el); else sentinelRefs.current.delete(pageIndex) }}
            data-page={pageIndex}
            className="h-0"
          />
          {pages.get(pageIndex) ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5 mb-5">
              {(pages.get(pageIndex) ?? []).map(item => (
                <AlbumCard
                  key={item.Id}
                  item={item}
                  onClick={() => navigate(`/album/${item.Id}`)}
                />
              ))}
            </div>
          ) : (
            <div
              className="mb-5"
              style={{ height: `${Math.ceil(Math.min(PAGE_SIZE, totalAlbums - pageIndex * PAGE_SIZE) / 6) * 240}px` }}
            />
          )}
        </div>
      ))}

      {loadingPages.size > 0 && pages.size > 0 && (
        <div className="py-8 flex justify-center">
          <Loader2 size={24} className="animate-spin text-text-tertiary" />
        </div>
      )}
    </div>
  )
}
