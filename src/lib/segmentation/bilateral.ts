/**
 * Edge-preserving smoothing of a packed Lab image — the stage that makes
 * regions follow *objects* instead of lighting gradients and fur/grass
 * texture. Iterated bilateral filtering flattens each surface toward a poster
 * color while refusing to blur across strong color edges.
 *
 * Cost control: the iterated filter runs at a capped resolution, then a
 * single joint-bilateral-upsample pass restores the working resolution using
 * the original full-res Lab as the edge guide. Smoothing destroys fine detail
 * by design, so nothing is lost by computing it small — but boundaries stay
 * crisp because the guide, not the low-res data, decides which side of an
 * edge each output pixel averages from.
 */

export interface SmoothingParams {
  /** Bilateral passes at the smoothing resolution. More = flatter posterization. */
  iterations: number
  /** Lab-distance sigma: colors within ~2 sigma blend, beyond stay separated. */
  rangeSigma: number
}

const SPATIAL_RADIUS = 4
const MAX_SMOOTHING_DIMENSION = 640
const UPSAMPLE_WINDOW = 2 // low-res taps per side in the joint upsample

function spatialKernel(radius: number, sigma: number): Float32Array {
  const side = radius * 2 + 1
  const kernel = new Float32Array(side * side)
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      kernel[(dy + radius) * side + (dx + radius)] = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma))
    }
  }
  return kernel
}

function bilateralPass(
  src: Float32Array,
  width: number,
  height: number,
  radius: number,
  spatial: Float32Array,
  rangeSigma: number,
): Float32Array {
  const out = new Float32Array(src.length)
  const side = radius * 2 + 1
  const invRange = 1 / (2 * rangeSigma * rangeSigma)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3
      const cL = src[i]
      const ca = src[i + 1]
      const cb = src[i + 2]

      let wSum = 0
      let L = 0
      let a = 0
      let b = 0

      const y0 = Math.max(0, y - radius)
      const y1 = Math.min(height - 1, y + radius)
      const x0 = Math.max(0, x - radius)
      const x1 = Math.min(width - 1, x + radius)

      for (let ny = y0; ny <= y1; ny++) {
        const kRow = (ny - y + radius) * side
        let j = (ny * width + x0) * 3
        for (let nx = x0; nx <= x1; nx++, j += 3) {
          const dL = src[j] - cL
          const da = src[j + 1] - ca
          const db = src[j + 2] - cb
          const w = spatial[kRow + (nx - x + radius)] * Math.exp(-(dL * dL + da * da + db * db) * invRange)
          wSum += w
          L += w * src[j]
          a += w * src[j + 1]
          b += w * src[j + 2]
        }
      }

      out[i] = L / wSum
      out[i + 1] = a / wSum
      out[i + 2] = b / wSum
    }
  }
  return out
}

function downscaleLab(src: Float32Array, width: number, height: number, outW: number, outH: number): Float32Array {
  const out = new Float32Array(outW * outH * 3)
  const scaleX = width / outW
  const scaleY = height / outH
  for (let y = 0; y < outH; y++) {
    const sy0 = Math.floor(y * scaleY)
    const sy1 = Math.min(height, Math.ceil((y + 1) * scaleY))
    for (let x = 0; x < outW; x++) {
      const sx0 = Math.floor(x * scaleX)
      const sx1 = Math.min(width, Math.ceil((x + 1) * scaleX))
      let L = 0
      let a = 0
      let b = 0
      let count = 0
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const j = (sy * width + sx) * 3
          L += src[j]
          a += src[j + 1]
          b += src[j + 2]
          count++
        }
      }
      const o = (y * outW + x) * 3
      out[o] = L / count
      out[o + 1] = a / count
      out[o + 2] = b / count
    }
  }
  return out
}

function jointBilateralUpsample(
  low: Float32Array,
  lowW: number,
  lowH: number,
  guide: Float32Array,
  width: number,
  height: number,
  rangeSigma: number,
): Float32Array {
  const out = new Float32Array(guide.length)
  const scaleX = lowW / width
  const scaleY = lowH / height
  const invRange = 1 / (2 * rangeSigma * rangeSigma)
  const spatialSigma = UPSAMPLE_WINDOW / 1.5
  const invSpatial = 1 / (2 * spatialSigma * spatialSigma)

  for (let y = 0; y < height; y++) {
    const ly = (y + 0.5) * scaleY - 0.5
    const lyi = Math.round(ly)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3
      const gL = guide[i]
      const ga = guide[i + 1]
      const gb = guide[i + 2]
      const lx = (x + 0.5) * scaleX - 0.5
      const lxi = Math.round(lx)

      let wSum = 0
      let L = 0
      let a = 0
      let b = 0

      const y0 = Math.max(0, lyi - UPSAMPLE_WINDOW)
      const y1 = Math.min(lowH - 1, lyi + UPSAMPLE_WINDOW)
      const x0 = Math.max(0, lxi - UPSAMPLE_WINDOW)
      const x1 = Math.min(lowW - 1, lxi + UPSAMPLE_WINDOW)

      for (let ny = y0; ny <= y1; ny++) {
        const dy = ny - ly
        for (let nx = x0; nx <= x1; nx++) {
          const dx = nx - lx
          const j = (ny * lowW + nx) * 3
          const dL = low[j] - gL
          const da = low[j + 1] - ga
          const db = low[j + 2] - gb
          const w =
            Math.exp(-(dx * dx + dy * dy) * invSpatial) *
            Math.exp(-(dL * dL + da * da + db * db) * invRange)
          wSum += w
          L += w * low[j]
          a += w * low[j + 1]
          b += w * low[j + 2]
        }
      }

      if (wSum > 1e-12) {
        out[i] = L / wSum
        out[i + 1] = a / wSum
        out[i + 2] = b / wSum
      } else {
        // Guide color matches nothing nearby in the low-res image (isolated speck);
        // fall back to the nearest low-res sample rather than emitting zeros.
        const j = (lyi * lowW + lxi) * 3
        out[i] = low[j]
        out[i + 1] = low[j + 1]
        out[i + 2] = low[j + 2]
      }
    }
  }
  return out
}

export function smoothLab(lab: Float32Array, width: number, height: number, params: SmoothingParams): Float32Array {
  const { iterations, rangeSigma } = params
  const maxDim = Math.max(width, height)
  const scale = Math.min(1, MAX_SMOOTHING_DIMENSION / maxDim)
  const spatial = spatialKernel(SPATIAL_RADIUS, SPATIAL_RADIUS / 1.5)

  if (scale === 1) {
    let current = lab
    for (let i = 0; i < iterations; i++) {
      current = bilateralPass(current, width, height, SPATIAL_RADIUS, spatial, rangeSigma)
    }
    return current
  }

  const lowW = Math.max(1, Math.round(width * scale))
  const lowH = Math.max(1, Math.round(height * scale))
  let low = downscaleLab(lab, width, height, lowW, lowH)
  for (let i = 0; i < iterations; i++) {
    low = bilateralPass(low, lowW, lowH, SPATIAL_RADIUS, spatial, rangeSigma)
  }
  return jointBilateralUpsample(low, lowW, lowH, lab, width, height, rangeSigma)
}
