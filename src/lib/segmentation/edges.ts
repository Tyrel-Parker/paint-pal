/**
 * Feature-line detection for the coloring-book outline: Canny-style edges
 * (gaussian → sobel → non-max suppression → hysteresis) over the
 * bilateral-smoothed lightness channel. Segmentation boundaries alone give
 * "cookie cutter + shading blobs" — they miss exactly the strokes that make
 * a subject readable (eyes, nose, mouth, ear lines, leg separations),
 * because those are luminance edges, not big color-region boundaries.
 *
 * Thresholds are percentile-based over the pixels inside `focusMask`, so
 * line density adapts to each photo's contrast instead of needing per-photo
 * tuning.
 */

export interface FeatureLineOptions {
  /** Only edges whose pixels fall inside this mask (>128) are kept. */
  focusMask?: Uint8Array
  /** Percentile (0-1) of gradient magnitude that seeds an edge. */
  strongPercentile?: number
  /** Percentile (0-1) above which pixels may extend a seeded edge (hysteresis). */
  weakPercentile?: number
  /** Connected edge chains shorter than this many pixels are dropped as noise. */
  minChainLength?: number
}

function gaussianBlur5(src: Float32Array, width: number, height: number): Float32Array {
  // Separable 5-tap kernel, sigma ~1.1
  const k = [0.06136, 0.24477, 0.38774, 0.24477, 0.06136]
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      for (let t = -2; t <= 2; t++) {
        const nx = Math.min(width - 1, Math.max(0, x + t))
        sum += k[t + 2] * src[y * width + nx]
      }
      tmp[y * width + x] = sum
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      for (let t = -2; t <= 2; t++) {
        const ny = Math.min(height - 1, Math.max(0, y + t))
        sum += k[t + 2] * tmp[ny * width + x]
      }
      out[y * width + x] = sum
    }
  }
  return out
}

/**
 * @param luminance L channel (any consistent scale), width*height
 * @returns 0/1 mask of feature-line pixels
 */
export function detectFeatureLines(
  luminance: Float32Array,
  width: number,
  height: number,
  options: FeatureLineOptions = {},
): Uint8Array {
  const {
    focusMask,
    strongPercentile = 0.95,
    weakPercentile = 0.85,
    minChainLength = 20,
  } = options
  const size = width * height

  const blurred = gaussianBlur5(luminance, width, height)

  // Sobel gradients
  const mag = new Float32Array(size)
  const dir = new Uint8Array(size) // quantized: 0=E/W, 1=NE/SW, 2=N/S, 3=NW/SE
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const gx =
        -blurred[i - width - 1] + blurred[i - width + 1] +
        -2 * blurred[i - 1] + 2 * blurred[i + 1] +
        -blurred[i + width - 1] + blurred[i + width + 1]
      const gy =
        -blurred[i - width - 1] - 2 * blurred[i - width] - blurred[i - width + 1] +
        blurred[i + width - 1] + 2 * blurred[i + width] + blurred[i + width + 1]
      mag[i] = Math.hypot(gx, gy)
      const angle = Math.atan2(gy, gx)
      // Map angle to one of 4 directions (period pi)
      const octant = Math.round((angle / Math.PI) * 4)
      dir[i] = ((octant % 4) + 4) % 4
    }
  }

  // Non-maximum suppression: keep only ridge crests so lines are 1px thin.
  const NEIGHBOR_OFFSET = [
    [1, 0], // 0: gradient E/W -> compare along x
    [1, -1], // 1
    [0, 1], // 2
    [1, 1], // 3
  ]
  const thin = new Float32Array(size)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      if (mag[i] === 0) continue
      const [dx, dy] = NEIGHBOR_OFFSET[dir[i]]
      const a = mag[(y - dy) * width + (x - dx)]
      const b = mag[(y + dy) * width + (x + dx)]
      if (mag[i] >= a && mag[i] >= b) thin[i] = mag[i]
    }
  }

  // Percentile thresholds over in-focus, nonzero-magnitude pixels.
  const samples: number[] = []
  for (let i = 0; i < size; i++) {
    if (thin[i] > 0 && (!focusMask || focusMask[i] > 128)) samples.push(thin[i])
  }
  if (samples.length === 0) return new Uint8Array(size)
  samples.sort((a, b) => a - b)
  const at = (p: number) => samples[Math.min(samples.length - 1, Math.floor(samples.length * p))]
  const strongThreshold = at(strongPercentile)
  const weakThreshold = at(weakPercentile)

  // Hysteresis: BFS from strong pixels through weak ones (8-connected).
  const edge = new Uint8Array(size)
  const queue = new Int32Array(size)
  let queueTail = 0
  for (let i = 0; i < size; i++) {
    if (thin[i] >= strongThreshold && (!focusMask || focusMask[i] > 128)) {
      edge[i] = 1
      queue[queueTail++] = i
    }
  }
  let queueHead = 0
  while (queueHead < queueTail) {
    const i = queue[queueHead++]
    const x = i % width
    const y = (i - x) / width
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy
      if (ny < 0 || ny >= height) continue
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx
        if (nx < 0 || nx >= width) continue
        const j = ny * width + nx
        if (edge[j] || thin[j] < weakThreshold) continue
        if (focusMask && focusMask[j] <= 128) continue
        edge[j] = 1
        queue[queueTail++] = j
      }
    }
  }

  return removeShortChains(edge, width, height, minChainLength)
}

export interface DarkMarkOptions {
  /** Only marks inside this mask (>128) are kept. */
  focusMask?: Uint8Array
  /** How much darker than the local mean a pixel must be (L units). */
  delta?: number
  /** Radius of the local-mean window. */
  blurRadius?: number
  /** Component-area bounds: below = speck, above = broad shading (both dropped). */
  minArea?: number
  maxArea?: number
}

/**
 * Filled dark details — eyes, noses, mouths, nostrils, claw lines. Coloring
 * books ink these solid rather than outlining them, which is why thin edge
 * chains never made faces read. Adaptive threshold against a local mean:
 * a pixel is a mark if it's clearly darker than its neighborhood, so soft
 * shading gradients don't trigger.
 */
export function detectDarkMarks(
  luminance: Float32Array,
  width: number,
  height: number,
  options: DarkMarkOptions = {},
): Uint8Array {
  const { focusMask, delta = 13, blurRadius = 24, minArea = 24, maxArea = width * height * 0.004 } = options
  const size = width * height

  // Local mean via summed-area table: O(n) regardless of radius.
  const sat = new Float64Array((width + 1) * (height + 1))
  for (let y = 0; y < height; y++) {
    let rowSum = 0
    for (let x = 0; x < width; x++) {
      rowSum += luminance[y * width + x]
      sat[(y + 1) * (width + 1) + (x + 1)] = sat[y * (width + 1) + (x + 1)] + rowSum
    }
  }

  const dark = new Uint8Array(size)
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - blurRadius)
    const y1 = Math.min(height - 1, y + blurRadius)
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (focusMask && focusMask[i] <= 128) continue
      const x0 = Math.max(0, x - blurRadius)
      const x1 = Math.min(width - 1, x + blurRadius)
      const area = (x1 - x0 + 1) * (y1 - y0 + 1)
      const sum =
        sat[(y1 + 1) * (width + 1) + (x1 + 1)] -
        sat[y0 * (width + 1) + (x1 + 1)] -
        sat[(y1 + 1) * (width + 1) + x0] +
        sat[y0 * (width + 1) + x0]
      if (luminance[i] < sum / area - delta) dark[i] = 1
    }
  }

  return filterComponentsByArea(dark, width, height, minArea, maxArea)
}

/** A mark must fill at least this fraction of its bounding box — eyes and
 * noses are compact blobs; elongated fur-shadow smears along the body are not. */
const MIN_FILL_RATIO = 0.3

/** Keep 8-connected components that are the right size AND compact. */
function filterComponentsByArea(
  mask: Uint8Array,
  width: number,
  height: number,
  minArea: number,
  maxArea: number,
): Uint8Array {
  const size = width * height
  const out = new Uint8Array(size)
  const visited = new Uint8Array(size)
  const stack = new Int32Array(size)
  const component = new Int32Array(size)

  for (let start = 0; start < size; start++) {
    if (!mask[start] || visited[start]) continue
    let stackTop = 0
    let count = 0
    let minX = width
    let maxX = 0
    let minY = height
    let maxY = 0
    stack[stackTop++] = start
    visited[start] = 1
    while (stackTop > 0) {
      const i = stack[--stackTop]
      component[count++] = i
      const x = i % width
      const y = (i - x) / width
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          if (nx < 0 || nx >= width) continue
          const j = ny * width + nx
          if (mask[j] && !visited[j]) {
            visited[j] = 1
            stack[stackTop++] = j
          }
        }
      }
    }
    const bboxArea = (maxX - minX + 1) * (maxY - minY + 1)
    if (count >= minArea && count <= maxArea && count / bboxArea >= MIN_FILL_RATIO) {
      for (let c = 0; c < count; c++) out[component[c]] = 1
    }
  }
  return out
}

/** Drop 8-connected edge components smaller than minLength pixels (specks and stubble). */
function removeShortChains(edge: Uint8Array, width: number, height: number, minLength: number): Uint8Array {
  const size = width * height
  const out = new Uint8Array(size)
  const visited = new Uint8Array(size)
  const stack = new Int32Array(size)
  const component = new Int32Array(size)

  for (let start = 0; start < size; start++) {
    if (!edge[start] || visited[start]) continue
    let stackTop = 0
    let count = 0
    stack[stackTop++] = start
    visited[start] = 1
    while (stackTop > 0) {
      const i = stack[--stackTop]
      component[count++] = i
      const x = i % width
      const y = (i - x) / width
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          if (nx < 0 || nx >= width) continue
          const j = ny * width + nx
          if (edge[j] && !visited[j]) {
            visited[j] = 1
            stack[stackTop++] = j
          }
        }
      }
    }
    if (count >= minLength) {
      for (let c = 0; c < count; c++) out[component[c]] = 1
    }
  }
  return out
}
