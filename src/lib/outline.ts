/**
 * Free Paint coloring-book outline, derived from a coarse segmentation
 * instead of edge detection. Region boundaries are closed curves by
 * construction, so every line encloses a fillable shape — the old
 * Sobel-threshold approach produced broken speckles that never joined up.
 *
 * Line hierarchy, real-coloring-book style:
 *   - subject silhouette: bold
 *   - features inside the subject: medium
 *   - background shape boundaries: thin (and few — OUTLINE_PARAMS collapses
 *     the background to a handful of big regions)
 */

import { segmentImage, decodeLabelMap, OUTLINE_PARAMS, effectiveMinArea } from './segmentation'

const INK = [31, 31, 31] as const

const SILHOUETTE_DILATE = 2 // ~6px stroke after the 2px base boundary
const INTERIOR_DILATE = 1 // ~4px
const BACKGROUND_DILATE = 0 // 2px base only

export interface GenerateOutlineOptions {
  /** Per-pixel foreground confidence (0-255), same width*height layout as `pixels`. */
  subjectMask?: Uint8Array
}

function dilateDisc(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return mask
  const offsets: number[] = []
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= radius * radius && (dx !== 0 || dy !== 0)) offsets.push(dx, dy)
    }
  }

  const out = new Uint8Array(mask)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue
      for (let k = 0; k < offsets.length; k += 2) {
        const nx = x + offsets[k]
        const ny = y + offsets[k + 1]
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) out[ny * width + nx] = 1
      }
    }
  }
  return out
}

export function generateOutline(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  options: GenerateOutlineOptions = {},
): Uint8ClampedArray {
  const { subjectMask } = options
  const size = width * height

  const result = segmentImage(pixels, width, height, OUTLINE_PARAMS.colorCount, {
    minRegionAreaPx: effectiveMinArea(OUTLINE_PARAMS.minRegionArea, width, height),
    backgroundMinRegionAreaPx: effectiveMinArea(OUTLINE_PARAMS.backgroundMinRegionArea, width, height),
    subjectMask,
    backgroundSimilarityDeltaE: OUTLINE_PARAMS.backgroundSimilarityDeltaE,
    smoothing: OUTLINE_PARAMS.smoothing,
    modeFilterRadius: OUTLINE_PARAMS.modeFilterRadius,
  })
  const labels = decodeLabelMap(result.labelMap)

  // Region-level subject membership, so the silhouette line coincides exactly
  // with segmentation boundaries instead of the raw (pixel-noisy) mask edge.
  let isSubjectRegion: Uint8Array | undefined
  if (subjectMask) {
    const maxId = result.regions.reduce((max, r) => Math.max(max, r.id), 0)
    const confidenceSum = new Float64Array(maxId + 1)
    const count = new Float64Array(maxId + 1)
    for (let i = 0; i < size; i++) {
      confidenceSum[labels[i]] += subjectMask[i]
      count[labels[i]]++
    }
    isSubjectRegion = new Uint8Array(maxId + 1)
    for (let id = 1; id <= maxId; id++) {
      if (count[id] > 0 && confidenceSum[id] / count[id] > 127) isSubjectRegion[id] = 1
    }
  }

  const silhouette = new Uint8Array(size)
  const interior = new Uint8Array(size)
  const background = new Uint8Array(size)

  const classify = (i: number, j: number) => {
    if (labels[i] === labels[j]) return
    if (!isSubjectRegion) {
      interior[i] = interior[j] = 1
      return
    }
    const a = isSubjectRegion[labels[i]]
    const b = isSubjectRegion[labels[j]]
    if (a !== b) {
      silhouette[i] = silhouette[j] = 1
    } else if (a) {
      interior[i] = interior[j] = 1
    } else {
      background[i] = background[j] = 1
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (x < width - 1) classify(i, i + 1)
      if (y < height - 1) classify(i, i + width)
    }
  }

  const strokes = [
    dilateDisc(silhouette, width, height, SILHOUETTE_DILATE),
    dilateDisc(interior, width, height, INTERIOR_DILATE),
    dilateDisc(background, width, height, BACKGROUND_DILATE),
  ]

  const out = new Uint8ClampedArray(size * 4)
  for (let i = 0; i < size; i++) {
    if (strokes[0][i] || strokes[1][i] || strokes[2][i]) {
      const o = i * 4
      out[o] = INK[0]
      out[o + 1] = INK[1]
      out[o + 2] = INK[2]
      out[o + 3] = 255
    }
  }
  return out
}
