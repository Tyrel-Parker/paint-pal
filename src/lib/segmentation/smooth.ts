/**
 * Majority-vote smoothing over the quantized-color-index grid, applied before
 * connected-component labeling. Fine texture (scales, fur, leaves) otherwise
 * fragments into hundreds of same-color islands individually too small to
 * survive region merging, each surrounded mostly by a different outline
 * color — so the merge step systematically erases that color rather than
 * consolidating its fragments. Smoothing first lets neighboring same-color
 * texture pixels consolidate into contiguous regions before CCL ever sees them.
 */
export function smoothPaletteIndex(
  index: Uint32Array,
  width: number,
  height: number,
  iterations = 1,
): Uint32Array {
  let current = index
  for (let pass = 0; pass < iterations; pass++) {
    const next = new Uint32Array(current.length)
    const counts = new Map<number, number>()

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        counts.clear()
        let bestValue = current[y * width + x]
        let bestCount = 0

        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy
          if (ny < 0 || ny >= height) continue
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx
            if (nx < 0 || nx >= width) continue
            const value = current[ny * width + nx]
            const count = (counts.get(value) ?? 0) + 1
            counts.set(value, count)
            if (count > bestCount) {
              bestCount = count
              bestValue = value
            }
          }
        }

        next[y * width + x] = bestValue
      }
    }
    current = next
  }
  return current
}
