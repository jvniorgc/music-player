import type { PlaybackContext } from '../services/playback'

/** Route of the page a playback context was started from, or null when it has none. */
export function contextPath(ctx: PlaybackContext | null | undefined): string | null {
  if (!ctx) return null
  switch (ctx.type) {
    case 'album': return ctx.id ? `/album/${ctx.id}` : null
    case 'playlist': return ctx.id ? `/playlist/${ctx.id}` : null
    case 'artist': return ctx.id ? `/artist/${ctx.id}` : null
    case 'songs': return '/songs'
    case 'home': return '/'
    case 'downloads': return '/downloads'
    case 'liked': return '/liked'
    case 'search': return ctx.id ? `/search?q=${encodeURIComponent(ctx.id)}` : '/search'
    default: return null
  }
}
