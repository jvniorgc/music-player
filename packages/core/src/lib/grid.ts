/** Number of columns that fit `width` with cards at least `minCard` wide (2–8). */
export function gridColumns(width: number, minCard: number, gap: number): number {
  if (!(width > 0)) return 2
  return Math.min(8, Math.max(2, Math.floor((width + gap) / (minCard + gap))))
}
