import { jellyfin, JellyfinItem } from './jellyfin'

// Tuning constants for the "Tocar Mix" generator.
const SEED_LIMIT = 40
const MAX_SEEDS = 12
const MAX_SEED_PER_ARTIST = 2
const SIMILAR_PER_SEED = 30
const RESOLVE_MULTIPLIER = 3
/** How many owned songs to pull per candidate (similar) artist. */
const SONGS_PER_ARTIST = 3
/** Cap on how many tracks by the same artist may appear before backfilling. */
const MAX_TRACKS_PER_ARTIST = 3
/** How many seeds to blend Jellyfin InstantMix radios from in the fallback. */
const MIX_SEEDS = 5
const RADIO_LIMIT = 50
const MONTH_DAYS = 30
/** Recency window (days) for the "trending" tracks sprinkled into the queue. */
const TRENDING_DAYS = 7
/** How many trending tracks to inject into the middle of the queue. */
const TRENDING_COUNT = 6

/** Normalize a title/artist for fuzzy matching: lowercase, drop bracketed suffixes and punctuation. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function primaryArtist(item: JellyfinItem): string {
  return item.Artists?.[0] || item.AlbumArtist || ''
}

/** yyyy-mm-dd for N days ago, used as the Playback Reporting `minDate`. */
function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

/** Keep at most `maxPerArtist` items per (normalized) artist, preserving order. */
function capPerArtist(items: JellyfinItem[], maxPerArtist: number): JellyfinItem[] {
  const counts = new Map<string, number>()
  const out: JellyfinItem[] = []
  for (const item of items) {
    const key = norm(primaryArtist(item))
    const n = counts.get(key) ?? 0
    if (n >= maxPerArtist) continue
    counts.set(key, n + 1)
    out.push(item)
  }
  return out
}

/** Round-robin merge of several ordered lists (one item from each in turn). */
function interleaveLists<T>(lists: T[][]): T[] {
  const queues = lists.map(l => [...l])
  const out: T[] = []
  let progressed = true
  while (progressed) {
    progressed = false
    for (const q of queues) {
      const next = q.shift()
      if (next !== undefined) {
        out.push(next)
        progressed = true
      }
    }
  }
  return out
}

/**
 * Reorder items so consecutive picks come from different artists (round-robin
 * across per-artist buckets). Within a bucket the original order is preserved,
 * so higher-ranked candidates still come first for each artist.
 */
function interleaveByArtist<T>(items: T[], artistOf: (item: T) => string): T[] {
  const buckets = new Map<string, T[]>()
  for (const item of items) {
    const key = artistOf(item)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(item)
    else buckets.set(key, [item])
  }
  return interleaveLists([...buckets.values()])
}

/**
 * Turn a raw candidate list into a diverse, playable queue: drop duplicate
 * songs, spread artists to the front (round-robin), then cap each artist at
 * MAX_TRACKS_PER_ARTIST — holding extras aside as backfill so the queue still
 * reaches `limit` when the library is short on variety.
 */
function diversify(items: JellyfinItem[], limit: number): JellyfinItem[] {
  const seen = new Set<string>()
  const unique: JellyfinItem[] = []
  for (const item of items) {
    if (seen.has(item.Id)) continue
    seen.add(item.Id)
    unique.push(item)
  }

  const spread = interleaveByArtist(unique, primaryArtist)
  const primary: JellyfinItem[] = []
  const overflow: JellyfinItem[] = []
  const artistCounts = new Map<string, number>()
  for (const item of spread) {
    const key = norm(primaryArtist(item))
    const n = artistCounts.get(key) ?? 0
    if (n < MAX_TRACKS_PER_ARTIST) {
      artistCounts.set(key, n + 1)
      primary.push(item)
    } else {
      overflow.push(item)
    }
  }
  return primary.concat(overflow).slice(0, limit)
}

/**
 * The user's most-played songs of the last month (falling back to all-time),
 * spread across artists so a few favourites don't dominate every seed.
 */
async function getSeeds(): Promise<JellyfinItem[]> {
  const userId = jellyfin.userId
  if (!userId) return []
  const recent = await jellyfin.getUserTopSongs(userId, SEED_LIMIT, daysAgoIso(MONTH_DAYS))
  const top = recent.length > 0 ? recent : await jellyfin.getUserTopSongs(userId, SEED_LIMIT)
  return capPerArtist(top, MAX_SEED_PER_ARTIST).slice(0, MAX_SEEDS)
}

/**
 * Variant A: seed with recent favourites, expand each via Last.fm
 * `track.getSimilar`, then collect the *similar artists* those tracks belong to
 * and pull owned library songs for each. Resolving at the artist level — instead
 * of the exact recommended track, which the user rarely owns — surfaces far more
 * artist variety while staying within the user's library.
 */
async function recommendViaLastfm(seeds: JellyfinItem[], limit: number): Promise<JellyfinItem[]> {
  const lists = await Promise.all(seeds.map(seed => {
    const artist = primaryArtist(seed)
    if (!artist || !seed.Name) return Promise.resolve([])
    return window.api.lastfmGetSimilarTracks({ artist, track: seed.Name }, SIMILAR_PER_SEED).catch(() => [])
  }))

  // Aggregate candidate artists by summed similarity across every seed's suggestions.
  const artistScores = new Map<string, { name: string; score: number }>()
  for (const list of lists) {
    for (const c of list) {
      const key = norm(c.artist)
      if (!key) continue
      const existing = artistScores.get(key)
      if (existing) existing.score += c.match
      else artistScores.set(key, { name: c.artist, score: c.match })
    }
  }

  const rankedArtists = [...artistScores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit * RESOLVE_MULTIPLIER)

  // Pull a few owned songs per candidate artist (in parallel), then round-robin
  // across artists and diversify so the queue spreads widely.
  const perArtist = await Promise.all(
    rankedArtists.map(a => jellyfin.getSongsByArtist(a.name, SONGS_PER_ARTIST).catch(() => [] as JellyfinItem[])),
  )

  return diversify(interleaveLists(perArtist), limit)
}

/**
 * Variant B: blend Jellyfin InstantMix radios seeded from the user's top songs.
 * Each seed's mix tends to cluster around one artist, so we round-robin several
 * seeds together and diversify the result; a random sample is the last resort.
 */
async function recommendViaInstantMix(seeds: JellyfinItem[], limit: number): Promise<JellyfinItem[]> {
  const mixes = await Promise.all(
    seeds.slice(0, MIX_SEEDS).map(seed =>
      jellyfin.getInstantMix(seed.Id, limit).then(m => m.Items).catch(() => [] as JellyfinItem[])
    ),
  )
  const blended = diversify(interleaveLists(mixes), limit)
  if (blended.length > 0) return blended

  const random = await jellyfin.getRandomSongs(limit)
  return diversify(random.Items, limit)
}

/**
 * The user's most-played songs of the last few days, excluding anything already
 * in the queue. These are sprinkled into the queue so a "mix" always mixes in
 * some of the tracks currently in heavy rotation.
 */
async function getTrending(exclude: Set<string>): Promise<JellyfinItem[]> {
  const userId = jellyfin.userId
  if (!userId) return []
  const recent = await jellyfin
    .getUserTopSongs(userId, TRENDING_COUNT * 3, daysAgoIso(TRENDING_DAYS))
    .catch(() => [] as JellyfinItem[])
  const fresh: JellyfinItem[] = []
  const seen = new Set(exclude)
  for (const item of recent) {
    if (seen.has(item.Id)) continue
    seen.add(item.Id)
    fresh.push(item)
    if (fresh.length >= TRENDING_COUNT) break
  }
  return fresh
}

/**
 * Splice trending tracks into random mid-queue positions — never at index 0 (so
 * playback still starts on a recommendation) and never appended at the very end.
 */
function injectTrending(base: JellyfinItem[], trending: JellyfinItem[], rng: () => number = Math.random): JellyfinItem[] {
  const out = [...base]
  for (const track of trending) {
    const span = Math.max(out.length - 1, 1)
    const pos = 1 + Math.floor(rng() * span)
    out.splice(pos, 0, track)
  }
  return out
}

/**
 * Build a "Tocar Mix" queue from the user's recent listening.
 *
 * Variant A (preferred): seed with the last month's most-played songs, expand
 * via Last.fm `track.getSimilar`, and resolve each recommendation against the
 * Jellyfin library so it is actually playable.
 *
 * Variant B (fallback): when Last.fm has no API key configured or produces
 * nothing playable, use Jellyfin's InstantMix radio — or a random sample when
 * there is no listening history yet.
 *
 * Finally, a handful of the user's last-few-days favourites are sprinkled into
 * the middle of the queue.
 */
export async function getRecommendations(limit = RADIO_LIMIT): Promise<JellyfinItem[]> {
  const seeds = await getSeeds()

  const status = await window.api.lastfmGetStatus().catch(() => null)
  let base: JellyfinItem[] = []
  if (status?.configured && seeds.length > 0) {
    base = await recommendViaLastfm(seeds, limit)
  }
  if (base.length === 0) {
    base = await recommendViaInstantMix(seeds, limit)
  }
  if (base.length === 0) return base

  const trending = await getTrending(new Set(base.map(i => i.Id)))
  return injectTrending(base, trending)
}
