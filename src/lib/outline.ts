/** Grayscale -> blur -> Sobel edges -> percentile threshold -> transparent-background line art. */

function toGrayscale(pixels: Uint8ClampedArray, size: number): Float32Array {
  const gray = new Float32Array(size)
  for (let i = 0; i < size; i++) {
    const o = i * 4
    gray[i] = 0.299 * pixels[o] + 0.587 * pixels[o + 1] + 0.114 * pixels[o + 2]
  }
  return gray
}

function boxBlur3x3(src: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(src.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      let count = 0
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          if (nx < 0 || nx >= width) continue
          sum += src[ny * width + nx]
          count++
        }
      }
      out[y * width + x] = sum / count
    }
  }
  return out
}

function sobelMagnitude(src: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(src.length)
  const at = (x: number, y: number) => {
    const cx = x < 0 ? 0 : x >= width ? width - 1 : x
    const cy = y < 0 ? 0 : y >= height ? height - 1 : y
    return src[cy * width + cx]
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx =
        -at(x - 1, y - 1) + at(x + 1, y - 1) +
        -2 * at(x - 1, y) + 2 * at(x + 1, y) +
        -at(x - 1, y + 1) + at(x + 1, y + 1)
      const gy =
        -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) +
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)
      out[y * width + x] = Math.sqrt(gx * gx + gy * gy)
    }
  }
  return out
}

function percentileThreshold(magnitude: Float32Array, percentile: number): number {
  const sorted = Float32Array.from(magnitude).sort()
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * percentile))
  return sorted[index]
}

export interface GenerateOutlineOptions {
  /** Per-pixel foreground confidence (0-255), same width*height layout as `pixels`. */
  subjectMask?: Uint8Array
  /** Percentile used where subjectMask (if any) says foreground: lower = more inclusive. */
  foregroundPercentile?: number
  /** Percentile used where subjectMask says background: higher = stricter, fewer lines. */
  backgroundPercentile?: number
}

/**
 * Percentiles control line density: 0.9 means the strongest 10% of gradients
 * become edges. Tuned empirically against real photos, not derived — see
 * scripts/tune-outline.ts and scripts/tune-subject-mask.ts (both deleted
 * after use). `backgroundPercentile` needed to go much higher than expected
 * (0.999, not ~0.96) — busy natural textures like rock/foliage turned out to
 * have surprisingly strong local gradients, comparable to or stronger than
 * many real subject edges, so a moderate percentile bump barely thinned them
 * out; only a very strict background threshold actually quieted them while
 * leaving the subject fully detailed. Without `subjectMask`,
 * `foregroundPercentile` applies uniformly (identical to the original
 * single-threshold behavior).
 */
export function generateOutline(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  options: GenerateOutlineOptions = {},
): Uint8ClampedArray {
  const { subjectMask, foregroundPercentile = 0.9, backgroundPercentile = 0.999 } = options
  const size = width * height
  const gray = toGrayscale(pixels, size)
  const blurred = boxBlur3x3(gray, width, height)
  const magnitude = sobelMagnitude(blurred, width, height)

  const out = new Uint8ClampedArray(size * 4)

  if (!subjectMask) {
    const threshold = percentileThreshold(magnitude, foregroundPercentile)
    for (let i = 0; i < size; i++) {
      out[i * 4 + 3] = magnitude[i] >= threshold ? 255 : 0
    }
    return out
  }

  const fgThreshold = percentileThreshold(magnitude, foregroundPercentile)
  const bgThreshold = percentileThreshold(magnitude, backgroundPercentile)
  for (let i = 0; i < size; i++) {
    const threshold = subjectMask[i] > 128 ? fgThreshold : bgThreshold
    out[i * 4 + 3] = magnitude[i] >= threshold ? 255 : 0
  }
  return out
}
