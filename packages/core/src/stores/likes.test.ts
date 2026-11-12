import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useLikesStore } from './likes'
import { useToastStore } from './toast'
import { jellyfin } from '../services/jellyfin'

const item = (Id: string, IsFavorite?: boolean) => ({ Id, UserData: IsFavorite === undefined ? undefined : { IsFavorite } }) as never

beforeEach(() => { vi.restoreAllMocks(); useLikesStore.setState({ liked: {} }) })

describe('likes store', () => {
  it('seeds unknown items from UserData without overwriting known state', () => {
    const s = useLikesStore.getState()
    s.seed([item('a', true), item('b', false), item('c')])
    expect(useLikesStore.getState().liked).toEqual({ a: true, b: false })
    s.seed([item('a', false)])
    expect(useLikesStore.getState().isLiked('a')).toBe(true)
    expect(useLikesStore.getState().isLiked('zzz')).toBe(false)
  })

  it('toggles optimistically and calls Jellyfin with the previous state', async () => {
    const toggle = vi.spyOn(jellyfin, 'toggleFavorite').mockResolvedValue()
    const p = useLikesStore.getState().toggle('a')
    expect(useLikesStore.getState().liked.a).toBe(true)
    expect(await p).toBe(true)
    expect(toggle).toHaveBeenCalledWith('a', false)
    await useLikesStore.getState().toggle('a')
    expect(toggle).toHaveBeenLastCalledWith('a', true)
    expect(useLikesStore.getState().liked.a).toBe(false)
  })

  it('rolls back and shows an error toast when the request fails', async () => {
    vi.spyOn(jellyfin, 'toggleFavorite').mockRejectedValue(new Error('x'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const show = vi.fn()
    useToastStore.setState({ show })
    useLikesStore.setState({ liked: { a: true } })
    expect(await useLikesStore.getState().toggle('a')).toBe(false)
    expect(useLikesStore.getState().liked.a).toBe(true)
    expect(show).toHaveBeenCalledWith("Couldn't update your liked songs", 'error')
  })

  it('fetches the state of an unknown item once', async () => {
    const getItem = vi.spyOn(jellyfin, 'getItem').mockResolvedValue(item('a', true))
    await useLikesStore.getState().ensure('a')
    await useLikesStore.getState().ensure('a')
    expect(getItem).toHaveBeenCalledTimes(1)
    expect(useLikesStore.getState().liked.a).toBe(true)
  })

  it('ignores fetch failures and items without UserData', async () => {
    vi.spyOn(jellyfin, 'getItem').mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(item('b'))
    await useLikesStore.getState().ensure('a')
    await useLikesStore.getState().ensure('b')
    expect(useLikesStore.getState().liked).toEqual({})
  })

  it('follows favorite changes made through the Jellyfin client', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })))
    jellyfin.setAuth({ serverUrl: 'http://jf.local', token: 'T', userId: 'u1', username: 'me', serverId: 's1' })
    await jellyfin.toggleFavorite('x', false)
    expect(useLikesStore.getState().liked.x).toBe(true)
    await jellyfin.toggleFavorite('x', true)
    expect(useLikesStore.getState().liked.x).toBe(false)
  })
})
