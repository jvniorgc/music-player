import { describe, it, expect } from 'vitest'
import { drawCover } from './CollageModal'

// A minimal CanvasRenderingContext2D fake that records the ordered sequence of
// operations relevant to clipping, so we can assert that an off-square cover is
// clipped to its cell instead of overflowing into adjacent cells.
type Op =
  | { op: 'save' }
  | { op: 'restore' }
  | { op: 'rect'; args: [number, number, number, number] }
  | { op: 'clip' }
  | { op: 'drawImage'; args: [number, number, number, number] }

function makeCtx() {
  const ops: Op[] = []
  const ctx = {
    save: () => ops.push({ op: 'save' }),
    restore: () => ops.push({ op: 'restore' }),
    beginPath: () => {},
    rect: (x: number, y: number, w: number, h: number) =>
      ops.push({ op: 'rect', args: [x, y, w, h] }),
    clip: () => ops.push({ op: 'clip' }),
    drawImage: (_img: unknown, dx: number, dy: number, w: number, h: number) =>
      ops.push({ op: 'drawImage', args: [dx, dy, w, h] }),
  } as unknown as CanvasRenderingContext2D
  return { ctx, ops }
}

const img = (width: number, height: number) =>
  ({ width, height }) as HTMLImageElement

describe('drawCover', () => {
  it('clips a non-square (wide) cover to the cell so it cannot overflow', () => {
    const { ctx, ops } = makeCtx()
    // 16:9 cover (e.g. a YouTube thumbnail) into a 100px square cell at (10, 20).
    drawCover(ctx, img(1280, 720), 10, 20, 100)

    const clipIdx = ops.findIndex(o => o.op === 'clip')
    const drawIdx = ops.findIndex(o => o.op === 'drawImage')

    // Clipping must happen, and before drawing the image.
    expect(clipIdx).toBeGreaterThanOrEqual(0)
    expect(drawIdx).toBeGreaterThan(clipIdx)

    // The clip region is exactly the cell square.
    const rectOp = ops.find(o => o.op === 'rect') as Extract<Op, { op: 'rect' }>
    expect(rectOp.args).toEqual([10, 20, 100, 100])

    // The drawn image is wider than the cell (cover crop), proving the clip is
    // what stops it bleeding into neighbouring cells.
    const drawOp = ops[drawIdx] as Extract<Op, { op: 'drawImage' }>
    const [, , w, h] = drawOp.args
    expect(w).toBeGreaterThan(100)
    expect(h).toBe(100)

    // The draw is wrapped in save/restore so the clip is scoped to this cover.
    expect(ops[0]).toEqual({ op: 'save' })
    expect(ops[ops.length - 1]).toEqual({ op: 'restore' })
  })

  it('clips a non-square (tall) cover to the cell so it cannot overflow', () => {
    const { ctx, ops } = makeCtx()
    drawCover(ctx, img(720, 1280), 0, 0, 100)

    const drawOp = ops.find(o => o.op === 'drawImage') as Extract<Op, { op: 'drawImage' }>
    const [, , w, h] = drawOp.args
    expect(w).toBe(100)
    expect(h).toBeGreaterThan(100)
    expect(ops.some(o => o.op === 'clip')).toBe(true)
  })

  it('fills the full cell for a square cover (no overflow, no gaps)', () => {
    const { ctx, ops } = makeCtx()
    drawCover(ctx, img(640, 640), 0, 0, 100)

    const drawOp = ops.find(o => o.op === 'drawImage') as Extract<Op, { op: 'drawImage' }>
    expect(drawOp.args).toEqual([0, 0, 100, 100])
  })
})
