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
export function modeFilter(
  index: Uint32Array,
  width: number,
  height: number,
  radius: number,
  passes: number,
  valueCount: number,
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

        const center = current[y * width + x]
        let bestValue = center
        let bestCount = counts[center] // ties go to the current value: no churn on 50/50 boundaries
        for (let v = 0; v < valueCount; v++) {
          if (counts[v] > bestCount) {
            bestCount = counts[v]
            bestValue = v
          }
        }
        next[y * width + x] = bestValue
      }
    }
    current = next
  }
  return current
}
