import { useEffect, useState, useRef } from 'react'

const FALLBACK = ['#1a0a2e', '#0a1a3a', '#2e0a1a', '#0a2e1a']
const paletteCache = new Map<string, string[]>()

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h / 6, s, l]
}

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b]
    .map(v => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0'))
    .join('')
}

function buildPalette(data: Uint8ClampedArray): string[] {
  type Pixel = { r: number; g: number; b: number; h: number; s: number }
  const pixels: Pixel[] = []
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    const [h, s, l] = rgbToHsl(r, g, b)
    if (l < 0.1 || l > 0.92 || s < 0.12) continue
    pixels.push({ r, g, b, h, s })
  }

  if (pixels.length < 8) return FALLBACK

  pixels.sort((a, b) => a.h - b.h)
  const buckets: Pixel[][] = [[], [], [], []]
  const step = Math.ceil(pixels.length / 4)
  for (let i = 0; i < 4; i++) buckets[i] = pixels.slice(i * step, (i + 1) * step)

  return buckets.map((bucket, idx) => {
    const src = bucket.length > 0 ? bucket : pixels.slice(0, Math.max(1, Math.floor(pixels.length / 4)))
    let r = 0, g = 0, b = 0
    for (const p of src) { r += p.r; g += p.g; b += p.b }
    r /= src.length; g /= src.length; b /= src.length
    const avg = (r + g + b) / 3
    const boost = idx % 2 === 0 ? 1.7 : 1.4
    return toHex(avg + (r - avg) * boost, avg + (g - avg) * boost, avg + (b - avg) * boost)
  })
}

async function extractColors(url: string): Promise<string[]> {
  if (paletteCache.has(url)) return paletteCache.get(url)!
  try {
    const resp = await fetch(url)
    const blob = await resp.blob()
    const objectUrl = URL.createObjectURL(blob)
    const colors = await new Promise<string[]>((resolve) => {
      const img = new Image()
      img.onload = () => {
        URL.revokeObjectURL(objectUrl)
        try {
          const size = 48
          const canvas = document.createElement('canvas')
          canvas.width = canvas.height = size
          const ctx = canvas.getContext('2d')!
          ctx.drawImage(img, 0, 0, size, size)
          resolve(buildPalette(ctx.getImageData(0, 0, size, size).data))
        } catch { resolve(FALLBACK) }
      }
      img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(FALLBACK) }
      img.src = objectUrl
    })
    paletteCache.set(url, colors)
    return colors
  } catch { return FALLBACK }
}

// Each blob is 200×200% of the container, centered at -50%/-50%,
// with the radial gradient focal point in a different quadrant.
// This guarantees no visible edges anywhere on screen.
const BLOBS: Array<{ keyframe: string; duration: number; delay: number; cx: string; cy: string }> = [
  { keyframe: 'blob-float-1', duration: 26, delay:   0, cx: '22%', cy: '22%' },
  { keyframe: 'blob-float-2', duration: 34, delay: -10, cx: '78%', cy: '75%' },
  { keyframe: 'blob-float-3', duration: 28, delay: -18, cx: '78%', cy: '22%' },
  { keyframe: 'blob-float-4', duration: 32, delay:  -7, cx: '22%', cy: '78%' },
]

interface Props { imageUrl: string | null }

export default function AnimatedBackground({ imageUrl }: Props) {
  const [colors, setColors] = useState<string[]>(FALLBACK)
  const versionRef = useRef(0)

  useEffect(() => {
    if (!imageUrl) return
    const version = ++versionRef.current
    extractColors(imageUrl).then(c => {
      if (versionRef.current === version) setColors(c)
    })
  }, [imageUrl])

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-black" />

      {BLOBS.map((b, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: '-50%',
            left: '-50%',
            width: '200%',
            height: '200%',
            background: `radial-gradient(ellipse at ${b.cx} ${b.cy}, ${colors[i]}d0 0%, ${colors[i]}60 38%, ${colors[i]}10 60%, transparent 72%)`,
            animation: `${b.keyframe} ${b.duration}s ease-in-out infinite`,
            animationDelay: `${b.delay}s`,
            willChange: 'transform',
          }}
        />
      ))}

      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-black/55" />
    </div>
  )
}
