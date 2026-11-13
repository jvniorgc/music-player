import { Client, type SetActivity } from '@xhayper/discord-rpc'
import { getDatabase } from './database'
import type { DiscordPresence } from '@music-player/core/platform'

export const DISCORD_CLIENT_ID = '1570431140270055615'
/** Fallback Rich Presence asset when no public cover URL is available. */
export const LARGE_IMAGE_KEY = 'app_icon'
export const RETRY_BASE_MS = 5_000
export const RETRY_MAX_MS = 60_000

const KEY_ENABLED = 'discord_enabled'
const ACTIVITY_TYPE_LISTENING = 2
const MAX_FIELD = 128
const MAX_IMAGE_URL = 256
/** Shows the `state` field (artist) as "Listening to …" instead of the app name. */
const STATUS_DISPLAY_STATE = 1

let client: Client | null = null
let connecting: Promise<Client | null> | null = null
let activity: SetActivity | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let retryDelay = RETRY_BASE_MS
// Bumped on teardown so in-flight connections know they are stale.
let generation = 0

export function isEnabled(): boolean {
  const row = getDatabase().prepare('SELECT value FROM settings WHERE key = ?').get(KEY_ENABLED) as { value: string } | undefined
  return row?.value === '1'
}

export function setEnabled(enabled: boolean): void {
  getDatabase().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(KEY_ENABLED, enabled ? '1' : '0')
  if (!enabled) void teardown()
}

/** Discord requires 2..128 chars for text fields. */
function field(s: string | undefined): string | undefined {
  if (!s) return undefined
  return s.padEnd(2, ' ').slice(0, MAX_FIELD)
}

function toActivity(p: DiscordPresence): SetActivity {
  const now = Date.now()
  const start = Math.round(now - p.position * 1000)
  return {
    type: ACTIVITY_TYPE_LISTENING,
    details: field(p.title),
    state: field(p.artist),
    largeImageKey: p.imageUrl?.startsWith('https://') && p.imageUrl.length <= MAX_IMAGE_URL ? p.imageUrl : LARGE_IMAGE_KEY,
    largeImageText: field(p.album),
    statusDisplayType: STATUS_DISPLAY_STATE,
    startTimestamp: start,
    endTimestamp: p.duration > 0 ? Math.round(start + p.duration * 1000) : undefined,
    instance: false,
  }
}

/** Show `presence` on Discord, or clear it with null (pause/stop). Never throws. */
export async function setActivity(presence: DiscordPresence | null): Promise<void> {
  if (!isEnabled()) return
  if (!presence) {
    activity = null
    cancelRetry()
    if (client) await client.user?.clearActivity().catch(() => {})
    return
  }
  activity = toActivity(presence)
  const c = await connect()
  if (c) await send(c)
}

async function send(c: Client): Promise<void> {
  if (activity) await c.user?.setActivity(activity).catch(() => {})
}

function connect(): Promise<Client | null> {
  if (client) return Promise.resolve(client)
  if (connecting) return connecting
  const gen = generation
  connecting = (async () => {
    const c = new Client({ clientId: DISCORD_CLIENT_ID })
    c.on('disconnected', () => onDisconnected(c))
    try {
      await c.login()
    } catch {
      connecting = null
      await c.destroy().catch(() => {})
      scheduleRetry()
      return null
    }
    connecting = null
    if (gen !== generation) {
      await c.destroy().catch(() => {})
      return null
    }
    client = c
    retryDelay = RETRY_BASE_MS
    return c
  })()
  return connecting
}

function onDisconnected(c: Client): void {
  if (c !== client) return
  client = null
  scheduleRetry()
}

function scheduleRetry(): void {
  if (!activity || retryTimer) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    void retry()
  }, retryDelay)
  retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS)
}

async function retry(): Promise<void> {
  const c = await connect()
  if (c) await send(c)
}

function cancelRetry(): void {
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  retryDelay = RETRY_BASE_MS
}

async function teardown(): Promise<void> {
  generation++
  connecting = null
  activity = null
  cancelRetry()
  const c = client
  client = null
  if (!c) return
  await c.user?.clearActivity().catch(() => {})
  await c.destroy().catch(() => {})
}

/** Clear presence and disconnect (on quit). Never throws. */
export function shutdown(): Promise<void> {
  return teardown()
}
