/**
 * Free Paint coloring-book outline. Three line sources, composed like an
 * actual coloring page:
 *
 *   1. Subject silhouette (from the coarse segmentation) — bold, closed.
 *   2. Feature lines inside the subject (Canny-style edges on the smoothed
 *      lightness channel) — eyes, nose, mouth, ear lines, leg separations.
 *      These are what make a bear *look like a bear*; region boundaries
 *      alone give a cookie-cutter with shading blobs.
 *   3. Interior/background region boundaries — kept only where the two
 *      regions' colors differ strongly (real structure like mane-vs-face),
 *      so soft shading transitions don't add noise lines.
 */

import { segmentImage, decodeLabelMap, OUTLINE_PARAMS, effectiveMinArea } from './segmentation'
import { rgbaToLab, hexToLab } from './segmentation/lab'
import { smoothLab } from './segmentation/bilateral'
import { detectFeatureLines, detectDarkMarks } from './segmentation/edges'
import { traceContours, simplifyLoop, chaikinLoop, strokeLoop } from './segmentation/contour'

const INK = [31, 31, 31] as const

const SILHOUETTE_BRUSH_RADIUS = 3
/** DP tolerance: wobble below this many pixels becomes a straight stroke. */
const SILHOUETTE_SIMPLIFY_EPSILON = 2.2
const SILHOUETTE_SMOOTH_ROUNDS = 2
/** Subject blobs / holes smaller than this aren't worth a silhouette loop. */
const SILHOUETTE_MIN_COMPONENT_AREA = 200
const FEATURE_DILATE = 1 // ~3px
const REGION_LINE_DILATE = 0 // 2px base only
/** Region boundaries survive only if the two sides' palette colors differ by at least this ΔE. */
const REGION_LINE_MIN_DELTA_E = 18

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

/** Feature detection needs texture *lightly* tamed: enough to kill fur/grass
 * stubble, far less than the segmentation smoothing (which would erase the
 * eyes and nose we're trying to find). */
const FEATURE_SMOOTHING = { iterations: 2, rangeSigma: 8 }
/** Focus mask erosion: keeps silhouette-adjacent contrast out of the feature
 * detector, so interior features (not the boundary) set the thresholds. */
const FOCUS_ERODE_RADIUS = 6

function erodeDisc(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const inverted = new Uint8Array(mask.length)
  for (let i = 0; i < mask.length; i++) inverted[i] = mask[i] > 128 ? 0 : 1
  const grown = dilateDisc(inverted, width, height, radius)
  const out = new Uint8Array(mask.length)
  for (let i = 0; i < mask.length; i++) out[i] = grown[i] ? 0 : 255
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

  const lab = rgbaToLab(pixels, size)
  const smoothedLab = smoothLab(lab, width, height, OUTLINE_PARAMS.smoothing)

  const result = segmentImage(pixels, width, height, OUTLINE_PARAMS.colorCount, {
    minRegionAreaPx: effectiveMinArea(OUTLINE_PARAMS.minRegionArea, width, height),
    backgroundMinRegionAreaPx: effectiveMinArea(OUTLINE_PARAMS.backgroundMinRegionArea, width, height),
    subjectMask,
    backgroundSimilarityDeltaE: OUTLINE_PARAMS.backgroundSimilarityDeltaE,
    smoothing: OUTLINE_PARAMS.smoothing,
    smoothedLab,
    modeFilterRadius: OUTLINE_PARAMS.modeFilterRadius,
    targetRegions: OUTLINE_PARAMS.targetRegions,
  })
  const labels = decodeLabelMap(result.labelMap)

  // Per-region subject membership and Lab color, so line decisions are made
  // region-to-region instead of on noisy pixels.
  const maxId = result.regions.reduce((max, r) => Math.max(max, r.id), 0)
  const regionLab = new Float32Array((maxId + 1) * 3)
  for (const region of result.regions) {
    const [L, a, b] = hexToLab(result.palette[region.colorNumber])
    regionLab[region.id * 3] = L
    regionLab[region.id * 3 + 1] = a
    regionLab[region.id * 3 + 2] = b
  }

  let isSubjectRegion: Uint8Array | undefined
  if (subjectMask) {
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

  // Silhouette: traced from the *raw* subject mask (not the segmentation
  // regions — mode filtering erodes thin structures like spires and ears)
  // and redrawn as simplified brush strokes — a drawn line, not a pixel trace.
  const silhouette = new Uint8Array(size)
  if (subjectMask) {
    const subjectPixels = new Uint8Array(size)
    for (let i = 0; i < size; i++) subjectPixels[i] = subjectMask[i] > 128 ? 1 : 0
    for (const loop of traceContours(subjectPixels, width, height, SILHOUETTE_MIN_COMPONENT_AREA)) {
      const smoothed = chaikinLoop(simplifyLoop(loop, SILHOUETTE_SIMPLIFY_EPSILON), SILHOUETTE_SMOOTH_ROUNDS)
      strokeLoop(silhouette, width, height, smoothed, SILHOUETTE_BRUSH_RADIUS)
    }
  }

  const regionLines = new Uint8Array(size)
  const minDeltaESq = REGION_LINE_MIN_DELTA_E * REGION_LINE_MIN_DELTA_E

  const classify = (i: number, j: number) => {
    const a = labels[i]
    const b = labels[j]
    if (a === b) return
    // Subject/background transitions are already covered by the traced silhouette.
    if (isSubjectRegion && isSubjectRegion[a] !== isSubjectRegion[b]) return
    const dL = regionLab[a * 3] - regionLab[b * 3]
    const da = regionLab[a * 3 + 1] - regionLab[b * 3 + 1]
    const db = regionLab[a * 3 + 2] - regionLab[b * 3 + 2]
    if (dL * dL + da * da + db * db >= minDeltaESq) {
      regionLines[i] = regionLines[j] = 1
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (x < width - 1) classify(i, i + 1)
      if (y < height - 1) classify(i, i + width)
    }
  }

  // Feature lines from a lightly-smoothed lightness channel, restricted to
  // the eroded subject interior — the background should stay quiet and the
  // silhouette shouldn't hog the thresholds.
  const featureLab = smoothLab(lab, width, height, FEATURE_SMOOTHING)
  const luminance = new Float32Array(size)
  for (let i = 0; i < size; i++) luminance[i] = featureLab[i * 3]
  // Eroded mask ∩ subject regions: erosion keeps silhouette contrast from
  // hogging the thresholds, the region intersection drops mask fuzz (stray
  // whiskers/tufts) that floats outside the drawn silhouette.
  let focusMask: Uint8Array | undefined
  if (subjectMask) {
    focusMask = erodeDisc(subjectMask, width, height, FOCUS_ERODE_RADIUS)
    if (isSubjectRegion) {
      for (let i = 0; i < size; i++) {
        if (!isSubjectRegion[labels[i]]) focusMask[i] = 0
      }
    }
  }
  const features = detectFeatureLines(luminance, width, height, { focusMask })
  // Filled dark details (eyes/nose/mouth) — drawn solid, like real inked pages.
  const darkMarks = detectDarkMarks(luminance, width, height, { focusMask })

  const strokes = [
    silhouette,
    dilateDisc(features, width, height, FEATURE_DILATE),
    dilateDisc(regionLines, width, height, REGION_LINE_DILATE),
    darkMarks,
  ]

  const out = new Uint8ClampedArray(size * 4)
  for (let i = 0; i < size; i++) {
    if (strokes[0][i] || strokes[1][i] || strokes[2][i] || strokes[3][i]) {
      const o = i * 4
      out[o] = INK[0]
      out[o + 1] = INK[1]
      out[o + 2] = INK[2]
      out[o + 3] = 255
    }
  }
  return out
}
