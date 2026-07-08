/**
 * Majority (mode) filter over a palette-index map — the boundary-cleanup
 * stage. Replaces the old 3x3 smooth.ts with a configurable radius and a
 * sliding-window histogram, because a 1px-radius vote can't round out the
 * pixel-staircase raggedness the old pipeline suffered from.
 *
 * Runs before connected-component labeling: kills speckle islands and rounds
 * boundary staircases into organic curves while staying raster-consistent
 * (no vector tracing, so no gap/overlap risk between regions).
 */
export interface ModeFilterPartition {
  /** Per-pixel 0/1 partition (subject vs background). */
  isForeground: Uint8Array
  /** Palette indices below this are foreground colors. */
  foregroundColorCount: number
}

export function modeFilter(
  index: Uint32Array,
  width: number,
  height: number,
  radius: number,
  passes: number,
  valueCount: number,
  /** When set, a pixel never flips to a color from the other partition — the subject boundary stays put. */
  partition?: ModeFilterPartition,
): Uint32Array {
  if (radius <= 0 || passes <= 0) return index

  let current = index
  const counts = new Uint32Array(valueCount)

  for (let pass = 0; pass < passes; pass++) {
    const next = new Uint32Array(current.length)

    for (let y = 0; y < height; y++) {
      const y0 = Math.max(0, y - radius)
      const y1 = Math.min(height - 1, y + radius)

      // Seed the histogram with the window for x = 0, then slide it right:
      // add the entering column, remove the leaving one. O(width * windowHeight)
      // per row instead of O(width * windowArea).
      counts.fill(0)
      const seedX1 = Math.min(width - 1, radius)
      for (let ny = y0; ny <= y1; ny++) {
        const rowOffset = ny * width
        for (let nx = 0; nx <= seedX1; nx++) counts[current[rowOffset + nx]]++
      }

      for (let x = 0; x < width; x++) {
        if (x > 0) {
          const enter = x + radius
          const leave = x - radius - 1
          for (let ny = y0; ny <= y1; ny++) {
            const rowOffset = ny * width
            if (enter < width) counts[current[rowOffset + enter]]++
            if (leave >= 0) counts[current[rowOffset + leave]]--
          }
        }

        const i = y * width + x
        const center = current[i]
        let bestValue = center
        let bestCount = counts[center] // ties go to the current value: no churn on 50/50 boundaries
        // With a partition, votes for the other side's colors are ignored so a
        // foreground pixel near the silhouette can't get mode-filtered into sky.
        let vFrom = 0
        let vTo = valueCount
        if (partition) {
          if (partition.isForeground[i]) vTo = partition.foregroundColorCount
          else vFrom = partition.foregroundColorCount
        }
        for (let v = vFrom; v < vTo; v++) {
          if (counts[v] > bestCount) {
            bestCount = counts[v]
            bestValue = v
          }
        }
        next[i] = bestValue
      }
    }
    current = next
  }
  return current
}
