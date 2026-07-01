import type { Palette, PuzzleRegion } from '../types/puzzle'

/** Numbers mode: fills only if the selected numbered color matches the region's own number. */
export function matchFillNumbers(
  region: PuzzleRegion,
  palette: Palette,
  selectedColorNumber: number | null,
): string | null {
  if (selectedColorNumber === null || selectedColorNumber !== region.colorNumber) return null
  return palette[region.colorNumber] ?? null
}

/** Free mode: any tap fills with whatever color is currently selected. */
export function freeFill(selectedColor: string): string {
  return selectedColor
}
