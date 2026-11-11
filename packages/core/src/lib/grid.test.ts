import { describe, it, expect } from 'vitest'
import { gridColumns } from './grid'

describe('gridColumns', () => {
  it('fits as many min-width cards as possible, clamped to 2–8', () => {
    expect(gridColumns(0, 160, 20)).toBe(2)
    expect(gridColumns(300, 160, 20)).toBe(2)
    expect(gridColumns(880, 160, 20)).toBe(5)
    expect(gridColumns(860, 160, 20)).toBe(4)
    expect(gridColumns(5000, 160, 20)).toBe(8)
  })
})
