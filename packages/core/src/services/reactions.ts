import { socialRequest } from './social'

export const REACTION_EMOJIS = ['🔥', '❤️', '😂', '😮', '😢', '👎'] as const
export const MAX_COMMENT_LENGTH = 280
const SUMMARY_CHUNK = 200

export type ReactionItemType = 'track' | 'album'

export interface ReactionGroup { emoji: string; count: number; mine: boolean; users: string[] }

export interface ItemComment {
  id: number
  itemId: string
  itemType: ReactionItemType
  user: { id: string; name: string }
  body: string
  positionSeconds: number | null
  createdAt: string
}

export interface ItemSocial { reactions: ReactionGroup[]; comments: ItemComment[] }

export interface ItemSummary { reactions: number; comments: number; mine: string[]; top: string[] }

const item = (id: string) => `/items/${encodeURIComponent(id)}`

export function getSocial(itemId: string): Promise<ItemSocial> {
  return socialRequest<ItemSocial>(`${item(itemId)}/social`)
}

export function setReaction(itemId: string, itemType: ReactionItemType, emoji: string, on: boolean): Promise<ItemSocial> {
  return socialRequest<ItemSocial>(`${item(itemId)}/reactions/${encodeURIComponent(emoji)}?item_type=${itemType}`,
    { method: on ? 'PUT' : 'DELETE' })
}

export function addComment(itemId: string, itemType: ReactionItemType, body: string, positionSeconds?: number): Promise<ItemComment> {
  return socialRequest<ItemComment>(`${item(itemId)}/comments`, {
    method: 'POST',
    body: JSON.stringify({ item_type: itemType, body, ...(positionSeconds !== undefined && { positionSeconds }) }),
  })
}

export function deleteComment(id: number): Promise<void> {
  return socialRequest<void>(`/comments/${id}`, { method: 'DELETE' })
}

/** Batch reaction/comment counts; only items with activity are present in the result. */
export async function getSummary(ids: string[]): Promise<Record<string, ItemSummary>> {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += SUMMARY_CHUNK) chunks.push(ids.slice(i, i + SUMMARY_CHUNK))
  const results = await Promise.all(chunks.map(c =>
    socialRequest<{ items: Record<string, ItemSummary> }>('/social/summary', { method: 'POST', body: JSON.stringify({ ids: c }) })))
  return Object.assign({}, ...results.map(r => r.items))
}
