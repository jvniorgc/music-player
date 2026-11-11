import { useEffect, useRef, useState } from 'react'
import type { JellyfinItem } from '../../services/jellyfin'
import {
  usePopularityStore, loadPopularitySettings, getTrackStats, trackKey, trackArtist,
  peekCached, reportTrackPlays, meterLevel, type PopularityStats,
} from '../../services/popularity'
import { useT, formatCompact, formatNumber } from '../../i18n'

/** True when the user enabled popularity display and a Last.fm API key exists. */
export function usePopularityActive(): boolean {
  const { enabled, available } = usePopularityStore()
  useEffect(() => { loadPopularitySettings() }, [])
  return enabled && available
}

/** Load stats for a header while active; `key` changes trigger a reload. */
export function useHeaderStats(key: string | null, load: () => Promise<PopularityStats | null>): PopularityStats | null {
  const active = usePopularityActive()
  const [stats, setStats] = useState<PopularityStats | null>(null)
  useEffect(() => {
    setStats(null)
    if (!active || !key) return
    let cancelled = false
    load().then(s => { if (!cancelled) setStats(s) })
    return () => { cancelled = true }
  }, [active, key])
  return active ? stats : null
}

/** Compact "1.2M listeners · 15M plays · 42 by you" line for headers. */
export function PopularitySummary({ stats }: { stats: PopularityStats | null }) {
  const { t } = useT()
  if (!stats) return null
  const parts = [
    t('popularity.listeners', { value: formatCompact(stats.listeners) }),
    t('popularity.plays', { value: formatCompact(stats.playcount) }),
  ]
  if (stats.userPlaycount !== undefined) parts.push(t('popularity.yourPlays', { value: formatCompact(stats.userPlaycount) }))
  return (
    <p className="text-xs text-text-tertiary mt-1 truncate" title={t('popularity.source')} data-testid="popularity-summary">
      {parts.join(' · ')}
    </p>
  )
}

/** 5-bar meter for a track, relative to the most-played loaded track in `group`. Fixed size: no layout shift. */
export function TrackPopularity({ item, group }: { item: JellyfinItem; group: string }) {
  const { t } = useT()
  const ref = useRef<HTMLSpanElement>(null)
  const artist = trackArtist(item)
  const key = trackKey(artist, item.Name || '')
  const [stats, setStats] = useState<PopularityStats | null | undefined>(() => peekCached(key))
  const max = usePopularityStore(s => s.maxPlays[group] ?? 0)

  useEffect(() => {
    const cached = peekCached(key)
    if (cached !== undefined) {
      setStats(cached)
      return
    }
    let cancelled = false
    const load = () => {
      getTrackStats(artist, item.Name || '').then(s => { if (!cancelled) setStats(s) })
    }
    const el = ref.current
    if (typeof IntersectionObserver === 'undefined' || !el) {
      load()
      return () => { cancelled = true }
    }
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        io.disconnect()
        load()
      }
    })
    io.observe(el)
    return () => { cancelled = true; io.disconnect() }
  }, [key])

  useEffect(() => {
    if (stats) reportTrackPlays(group, stats.playcount)
  }, [stats, group])

  const level = stats ? meterLevel(stats.playcount, Math.max(max, stats.playcount)) : 0
  const title = stats
    ? t('popularity.trackTooltip', { listeners: formatNumber(stats.listeners), plays: formatNumber(stats.playcount) })
    : undefined

  return (
    <span
      ref={ref}
      className="inline-flex items-end gap-[2px] h-3 w-[18px] shrink-0"
      title={title}
      aria-label={title}
      data-testid="track-popularity"
      data-level={level}
    >
      {stats && [1, 2, 3, 4, 5].map(i => (
        <span
          key={i}
          className={`w-[2px] rounded-[1px] ${i <= level ? 'bg-text-secondary' : 'bg-white/15'}`}
          style={{ height: `${40 + i * 12}%` }}
        />
      ))}
    </span>
  )
}
