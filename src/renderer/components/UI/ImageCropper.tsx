import { useRef, useState, useCallback, useEffect } from 'react'
import { ZoomIn, ZoomOut } from 'lucide-react'

interface ImageCropperProps {
  imageUrl: string
  onCrop: (blob: Blob) => void
  onCancel: () => void
  size?: number
}

export function ImageCropper({ imageUrl, onCrop, onCancel, size = 240 }: ImageCropperProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [imgNaturalSize, setImgNaturalSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      setImgNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
      imgRef.current = img
      setScale(1)
      setOffset({ x: 0, y: 0 })
    }
    img.src = imageUrl
  }, [imageUrl])

  // Base dimensions: fit the shorter side to the circle at scale=1
  const baseScale = imgNaturalSize.w && imgNaturalSize.h
    ? size / Math.min(imgNaturalSize.w, imgNaturalSize.h)
    : 1
  const baseW = imgNaturalSize.w * baseScale
  const baseH = imgNaturalSize.h * baseScale

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    setDragging(true)
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y })
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [offset])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    })
  }, [dragging, dragStart])

  const handlePointerUp = useCallback(() => {
    setDragging(false)
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.05 : 0.05
    setScale(s => Math.max(0.5, Math.min(3, s + delta)))
  }, [])

  const handleCrop = () => {
    if (!imgRef.current) return

    const canvas = document.createElement('canvas')
    const outputSize = 512
    canvas.width = outputSize
    canvas.height = outputSize
    const ctx = canvas.getContext('2d')!

    // Clip to circle
    ctx.beginPath()
    ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2)
    ctx.closePath()
    ctx.clip()

    // Map viewport to output canvas
    const ratio = outputSize / size
    const drawW = baseW * scale * ratio
    const drawH = baseH * scale * ratio
    const drawX = (outputSize - drawW) / 2 + offset.x * ratio
    const drawY = (outputSize - drawH) / 2 + offset.y * ratio

    ctx.drawImage(imgRef.current, drawX, drawY, drawW, drawH)

    canvas.toBlob(blob => {
      if (blob) onCrop(blob)
    }, 'image/png')
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Crop area */}
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-full border-2 border-border cursor-grab active:cursor-grabbing"
        style={{ width: size, height: size }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
      >
        <div className="absolute inset-0 bg-bg-elevated" />
        {imgNaturalSize.w > 0 && (
          <img
            src={imageUrl}
            alt=""
            draggable={false}
            className="absolute pointer-events-none select-none"
            style={{
              width: baseW * scale,
              height: 'auto',
              maxWidth: 'none',
              transform: 'none',
              left: (size - baseW * scale) / 2 + offset.x,
              top: (size - baseH * scale) / 2 + offset.y
            }}
          />
        )}
        {/* Circle overlay guide */}
        <div className="absolute inset-0 rounded-full ring-2 ring-white/20 pointer-events-none" />
      </div>

      {/* Zoom controls */}
      <div className="flex items-center gap-3 w-full max-w-[240px]">
        <ZoomOut size={16} className="text-text-tertiary shrink-0" />
        <input
          type="range"
          min="0.5"
          max="3"
          step="0.01"
          value={scale}
          onChange={e => setScale(parseFloat(e.target.value))}
          className="flex-1 accent-accent h-1"
        />
        <ZoomIn size={16} className="text-text-tertiary shrink-0" />
      </div>

      <p className="text-xs text-text-tertiary">Drag to reposition • Scroll to zoom</p>

      {/* Actions */}
      <div className="flex gap-3 w-full justify-end">
        <button
          onClick={onCancel}
          className="px-5 py-2 rounded-full text-sm text-text-secondary hover:text-text-primary hover:bg-white/10 transition-colors"
        >
          Back
        </button>
        <button
          onClick={handleCrop}
          className="px-5 py-2 rounded-full text-sm font-semibold bg-accent hover:bg-accent-hover text-white transition-colors"
        >
          Apply
        </button>
      </div>
    </div>
  )
}
