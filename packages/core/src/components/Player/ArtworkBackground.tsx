import { useEffect, useState } from 'react'
import { useInterfacePrefs } from '../../stores/prefs/interface'

interface Layer { url: string; key: number }

/**
 * Calm full-screen backdrop: a heavily blurred, darkened copy of the current
 * cover art that crossfades when the artwork changes. Falls back to plain black.
 */
export default function ArtworkBackground({ imageUrl }: { imageUrl: string | null }) {
  const [layers, setLayers] = useState<Layer[]>(() => (imageUrl ? [{ url: imageUrl, key: 0 }] : []))

  useEffect(() => {
    setLayers(prev => {
      if (!imageUrl) return []
      if (prev[prev.length - 1]?.url === imageUrl) return prev
      const key = (prev[prev.length - 1]?.key ?? 0) + 1
      return [...prev.slice(-1), { url: imageUrl, key }]
    })
  }, [imageUrl])

  const enabled = useInterfacePrefs(s => s.values.artworkBackground)

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none bg-black" aria-hidden="true">
      {enabled && layers.map((layer, i) => (
        <img
          key={layer.key}
          src={layer.url}
          alt=""
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover scale-125 blur-[80px] saturate-[1.2] opacity-0 animate-[bg-fade-in_1.2s_ease_forwards]"
          style={i < layers.length - 1 ? { animation: 'none', opacity: 0.55 } : undefined}
        />
      ))}
      <div className="absolute inset-0 bg-black/60" />
    </div>
  )
}
