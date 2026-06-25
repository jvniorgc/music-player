import { useEffect, useRef, useState, useCallback } from 'react'
import { jellyfin, JellyfinItem } from '../../services/jellyfin'
import { useToastStore } from '../../stores/toast'
import { TimePeriod, TIME_LABELS, getMinDate } from './UserProfileView'
import { X, Download, Loader2, Grid3x3 } from 'lucide-react'

type CollageType = 'albums' | 'songs'

type TopItem = JellyfinItem & { periodPlayCount?: number }

const GRID_SIZES = [3, 4, 5, 6, 7, 8, 9, 10]

// Source image size requested from Jellyfin (reused for preview + full-res render).
const IMG_REQUEST_SIZE = 640
// Cap the final image to roughly this many pixels per side.
const MAX_SIDE = 4096

function coverUrl(item: TopItem, type: CollageType, size: number): string | null {
  if (type === 'songs') {
    return item.AlbumId ? jellyfin.getImageUrl(item.AlbumId, undefined, size) : null
  }
  return item.ImageTags?.Primary
    ? jellyfin.getImageUrl(item.Id, item.ImageTags.Primary, size)
    : null
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

export function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  size: number
) {
  // object-fit: cover, clipped to the cell. Covers that aren't square (e.g. a
  // 16:9 YouTube thumbnail) are scaled to fill the square and the overflow is
  // clipped to the cell, so they crop cleanly instead of bleeding over the
  // neighbouring covers in the grid.
  const ratio = Math.max(size / img.width, size / img.height)
  const w = img.width * ratio
  const h = img.height * ratio
  const sx = dx + (size - w) / 2
  const sy = dy + (size - h) / 2
  ctx.save()
  ctx.beginPath()
  ctx.rect(dx, dy, size, size)
  ctx.clip()
  ctx.drawImage(img, sx, sy, w, h)
  ctx.restore()
}

const FONT_STACK = '-apple-system, "Segoe UI", Roboto, sans-serif'

// Title font size is a fixed fraction of a single cover, so titles stay the
// same compact size regardless of grid size (a 3×3 looks like a 10×10). Without
// this, the font scaled with the per-row band height and got huge on small
// grids, truncating titles.
const TITLE_FONT_RATIO = 0.055

// Line height as a multiple of the font size — keeps a row's titles packed
// tightly together (normal text leading) instead of spread across the cell.
const TITLE_LINE_SPACING = 1.35

function subtitleFor(item: TopItem, type: CollageType): string {
  return type === 'albums'
    ? (item.AlbumArtist || '')
    : (item.Artists?.join(', ') || item.AlbumArtist || '')
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) {
    t = t.slice(0, -1)
  }
  return t + '…'
}

// Draws the numbered title list to the right of the grid. Each grid row's titles
// are packed tightly together (no gaps between titles in the same row) and the
// group starts at the top of its matching grid row, so it stays easy to see
// which titles belong to each grid line.
function drawTitleSidebar(
  ctx: CanvasRenderingContext2D,
  items: TopItem[],
  type: CollageType,
  gridPx: number,
  grid: number,
  cell: number
) {
  const x = gridPx
  const padX = Math.max(8, cell * 0.1)
  const padY = Math.max(6, cell * 0.06)
  const innerW = ctx.canvas.width - gridPx - padX * 2
  ctx.textBaseline = 'middle'

  // Fixed, compact font size (independent of grid), capped so one row's worth of
  // tightly-packed titles still fits within that row's height.
  const fontSize = Math.max(
    9,
    Math.min(Math.floor(cell * TITLE_FONT_RATIO), Math.floor(cell / (grid * TITLE_LINE_SPACING)))
  )
  const lineH = fontSize * TITLE_LINE_SPACING

  for (let r = 0; r < grid; r++) {
    const groupTop = r * cell + padY

    for (let c = 0; c < grid; c++) {
      const idx = r * grid + c
      const item = items[idx]
      if (!item) continue
      const y = groupTop + c * lineH + lineH / 2
      let cx = x + padX

      const prefix = `${idx + 1}. `
      ctx.font = `600 ${fontSize}px ${FONT_STACK}`
      ctx.fillStyle = 'rgba(255,255,255,0.45)'
      ctx.fillText(prefix, cx, y)
      cx += ctx.measureText(prefix).width

      ctx.font = `700 ${fontSize}px ${FONT_STACK}`
      ctx.fillStyle = '#ffffff'
      const name = ellipsize(ctx, item.Name || '', x + padX + innerW - cx)
      ctx.fillText(name, cx, y)
      cx += ctx.measureText(name).width

      const artist = subtitleFor(item, type)
      const remaining = x + padX + innerW - cx
      if (artist && name === (item.Name || '') && remaining > fontSize * 2) {
        ctx.font = `400 ${fontSize}px ${FONT_STACK}`
        ctx.fillStyle = 'rgba(255,255,255,0.45)'
        const art = ellipsize(ctx, '  ·  ' + artist, remaining)
        ctx.fillText(art, cx, y)
      }
    }
  }
}

export default function CollageModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const showToast = useToastStore(s => s.show)
  const [grid, setGrid] = useState(3)
  const [type, setType] = useState<CollageType>('albums')
  const [period, setPeriod] = useState<TimePeriod>('7d')
  const [showTitles, setShowTitles] = useState(false)

  const [items, setItems] = useState<TopItem[]>([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // Cache loaded images by URL so preview and full-res render reuse them.
  const imageCache = useRef<Map<string, HTMLImageElement | null>>(new Map())

  const count = grid * grid

  // Fetch top items for the selected options.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoadingItems(true)
      try {
        const minDate = getMinDate(period)
        const result = type === 'albums'
          ? await jellyfin.getUserTopAlbums(userId, count, minDate)
          : await jellyfin.getUserTopSongs(userId, count, minDate)
        if (!cancelled) setItems(result)
      } catch (err) {
        console.error('Failed to load collage items:', err)
        if (!cancelled) setItems([])
      } finally {
        if (!cancelled) setLoadingItems(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [userId, type, period, count])

  const getImage = useCallback(async (url: string): Promise<HTMLImageElement | null> => {
    const cache = imageCache.current
    if (cache.has(url)) return cache.get(url) ?? null
    const img = await loadImage(url)
    cache.set(url, img)
    return img
  }, [])

  const renderCollage = useCallback(async (cell: number): Promise<HTMLCanvasElement> => {
    const gridPx = grid * cell
    // Title list occupies a panel to the right of the grid.
    const sidebarW = showTitles ? Math.round(gridPx * 0.55) : 0

    const canvas = document.createElement('canvas')
    canvas.width = gridPx + sidebarW
    canvas.height = gridPx
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const cells = items.slice(0, count)
    const imgs = await Promise.all(
      cells.map(item => {
        const url = coverUrl(item, type, IMG_REQUEST_SIZE)
        return url ? getImage(url) : Promise.resolve(null)
      })
    )

    for (let i = 0; i < count; i++) {
      const x = (i % grid) * cell
      const y = Math.floor(i / grid) * cell
      const img = imgs[i]
      if (img) {
        drawCover(ctx, img, x, y, cell)
      } else {
        ctx.fillStyle = '#0d0d0d'
        ctx.fillRect(x, y, cell, cell)
      }
    }

    if (showTitles) {
      drawTitleSidebar(ctx, cells, type, gridPx, grid, cell)
    }

    return canvas
  }, [grid, count, items, type, showTitles, getImage])

  // Regenerate preview when options or data change.
  useEffect(() => {
    let cancelled = false
    if (loadingItems) return
    const make = async () => {
      setRendering(true)
      try {
        const previewCell = Math.max(80, Math.floor(560 / grid))
        const canvas = await renderCollage(previewCell)
        if (!cancelled) setPreviewUrl(canvas.toDataURL('image/png'))
      } finally {
        if (!cancelled) setRendering(false)
      }
    }
    make()
    return () => { cancelled = true }
  }, [renderCollage, loadingItems, grid])

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const cell = Math.floor(Math.min(IMG_REQUEST_SIZE, MAX_SIDE / grid))
      const canvas = await renderCollage(cell)
      const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/png'))
      if (!blob) throw new Error('Failed to encode image')
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const filename = `collage-${type}-${period}-${grid}x${grid}-${Date.now()}.png`
      const result = await window.api.saveCollage({ bytes, filename })
      if (result?.success) {
        showToast('Collage saved to Downloads', 'success')
      } else {
        showToast(result?.error || 'Failed to save collage', 'error')
      }
    } catch (err: any) {
      console.error('Collage download failed:', err)
      showToast(err?.message || 'Failed to save collage', 'error')
    } finally {
      setDownloading(false)
    }
  }

  const hasData = items.length > 0
  const busy = loadingItems || rendering

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-bg-secondary border border-border rounded-2xl shadow-2xl shadow-black/50 w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Grid3x3 size={18} className="text-accent" />
            <h2 className="text-lg font-bold">Create collage</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-text-secondary hover:text-text-primary"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 grid md:grid-cols-[1fr_240px] gap-6">
          {/* Preview */}
          <div className="flex items-center justify-center bg-bg-primary rounded-xl p-3 min-h-[260px] relative">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Collage preview"
                className="max-w-full max-h-[60vh] rounded-md shadow-lg shadow-black/40"
                style={{ imageRendering: 'auto' }}
              />
            ) : (
              <div className="text-text-tertiary text-sm">No preview</div>
            )}
            {busy && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl">
                <Loader2 size={28} className="animate-spin text-text-secondary" />
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="space-y-4">
            <Field label="Type">
              <select
                value={type}
                onChange={e => setType(e.target.value as CollageType)}
                className="collage-select"
              >
                <option value="albums">Albums</option>
                <option value="songs">Songs</option>
              </select>
            </Field>

            <Field label="Time period">
              <select
                value={period}
                onChange={e => setPeriod(e.target.value as TimePeriod)}
                className="collage-select"
              >
                {(Object.keys(TIME_LABELS) as TimePeriod[]).map(key => (
                  <option key={key} value={key}>{TIME_LABELS[key]}</option>
                ))}
              </select>
            </Field>

            <Field label="Grid size">
              <select
                value={grid}
                onChange={e => setGrid(Number(e.target.value))}
                className="collage-select"
              >
                {GRID_SIZES.map(n => (
                  <option key={n} value={n}>{n}×{n}</option>
                ))}
              </select>
            </Field>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showTitles}
                onChange={e => setShowTitles(e.target.checked)}
                className="accent-accent w-4 h-4"
              />
              <span className="text-sm text-text-primary">Show titles</span>
            </label>

            <button
              onClick={handleDownload}
              disabled={!hasData || busy || downloading}
              className="w-full flex items-center justify-center gap-2 bg-accent text-black font-semibold rounded-lg px-4 py-2.5 text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {downloading ? (
                <><Loader2 size={16} className="animate-spin" /> Saving…</>
              ) : (
                <><Download size={16} /> Download</>
              )}
            </button>

            {!busy && !hasData && (
              <p className="text-xs text-text-tertiary">
                No listening data for this period.
              </p>
            )}
            {!busy && hasData && items.length < count && (
              <p className="text-xs text-text-tertiary">
                Only {items.length} item{items.length === 1 ? '' : 's'} available — empty cells will be blank.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1.5">{label}</label>
      {children}
    </div>
  )
}
