import type { Palette, PuzzleRegion } from '../../types/puzzle'
import { rgbaToLab, labToHex } from './lab'
import { smoothLab } from './bilateral'
import { buildPaletteKMeans, assignToPalette, assignToPalettePartitioned } from './kmeans'
import { modeFilter } from './modeFilter'
import { labelRegions, computeAdjacency } from './connectedComponents'
import { mergeSmallRegions, type MergeResult } from './mergeSmallRegions'
import { encodeLabelMap } from './rle'
import type { SegmentationOptions, SegmentationResult } from './types'

const DEFAULT_MIN_AREA_FRACTION = 0.004
const DEFAULT_MIN_AREA_FLOOR_PX = 150
const DEFAULT_SMOOTHING = { iterations: 5, rangeSigma: 11 }
const DEFAULT_MODE_FILTER_RADIUS = 3
const MODE_FILTER_PASSES = 2
/** Final palette colors get a slight chroma push — the bilateral flattening desaturates a touch. */
const PALETTE_CHROMA_BOOST = 1.12
/** Share of the color budget the subject gets when a mask splits the palette. */
const FOREGROUND_COLOR_SHARE = 0.65
/** Masks covering (almost) nothing or everything carry no usable split. */
const USABLE_MASK_FRACTION = 0.02
const MAX_TARGET_ATTEMPTS = 3

function findNearestMemberPixel(
  finalLabels: Uint32Array,
  width: number,
  height: number,
  regionId: number,
  cx: number,
  cy: number,
): { x: number; y: number } {
  const maxRadius = Math.max(width, height)
  for (let radius = 0; radius <= maxRadius; radius++) {
    const minX = Math.max(0, cx - radius)
    const maxX = Math.min(width - 1, cx + radius)
    const minY = Math.max(0, cy - radius)
    const maxY = Math.min(height - 1, cy + radius)
    for (let y = minY; y <= maxY; y++) {
      const onEdgeRow = y === minY || y === maxY
      const step = onEdgeRow ? 1 : Math.max(1, maxX - minX)
      for (let x = minX; x <= maxX; x += step) {
        if (finalLabels[y * width + x] === regionId) return { x, y }
      }
    }
  }
  return { x: cx, y: cy }
}

interface AttemptParams {
  colorCount: number
  minAreaPx: number
  backgroundMinAreaPx?: number
  backgroundSimilarityDeltaE?: number
}

interface AttemptResult {
  labels: Uint32Array
  merge: MergeResult
  centroids: Float32Array
  regionCount: number
}

export function segmentImage(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  colorCount: number,
  options: SegmentationOptions = {},
): SegmentationResult {
  const size = width * height
  const smoothing = options.smoothing ?? DEFAULT_SMOOTHING
  const modeFilterRadius = options.modeFilterRadius ?? DEFAULT_MODE_FILTER_RADIUS

  // 1. Perceptual color space + edge-preserving smoothing: flatten texture and
  //    lighting gradients so everything downstream follows object structure.
  //    This is the expensive stage — the adaptive attempts below all reuse it.
  const smoothed = options.smoothedLab ?? smoothLab(rgbaToLab(pixels, size), width, height, smoothing)

  // Hard subject/background partition (when the mask is informative): each
  // side gets its own palette so a small or low-contrast subject can't lose
  // its colors to acres of sky, and vice versa — "no detail and no background"
  // both come from the two sides competing for one budget.
  let isForeground: Uint8Array | undefined
  if (options.subjectMask) {
    const mask = options.subjectMask
    isForeground = new Uint8Array(size)
    let fgCount = 0
    for (let i = 0; i < size; i++) {
      if (mask[i] > 128) {
        isForeground[i] = 1
        fgCount++
      }
    }
    const fraction = fgCount / size
    if (fraction < USABLE_MASK_FRACTION || fraction > 1 - USABLE_MASK_FRACTION) isForeground = undefined
  }

  const runAttempt = (params: AttemptParams): AttemptResult => {
    let paletteIndex: Uint32Array
    let centroids: Float32Array
    let foregroundColorCount: number | undefined

    if (isForeground) {
      const fgK = Math.max(4, Math.round(params.colorCount * FOREGROUND_COLOR_SHARE))
      const bgK = Math.max(3, params.colorCount - fgK)
      const isBackground = new Uint8Array(size)
      for (let i = 0; i < size; i++) isBackground[i] = isForeground[i] ? 0 : 1
      const fgCentroids = buildPaletteKMeans(smoothed, size, fgK, isForeground)
      const bgCentroids = buildPaletteKMeans(smoothed, size, bgK, isBackground)
      foregroundColorCount = fgCentroids.length / 3
      centroids = new Float32Array(fgCentroids.length + bgCentroids.length)
      centroids.set(fgCentroids, 0)
      centroids.set(bgCentroids, fgCentroids.length)
      paletteIndex = assignToPalettePartitioned(smoothed, size, fgCentroids, bgCentroids, isForeground)
      paletteIndex = modeFilter(paletteIndex, width, height, modeFilterRadius, MODE_FILTER_PASSES, centroids.length / 3, {
        isForeground,
        foregroundColorCount,
      })
    } else {
      centroids = buildPaletteKMeans(smoothed, size, params.colorCount)
      paletteIndex = assignToPalette(smoothed, size, centroids)
      paletteIndex = modeFilter(paletteIndex, width, height, modeFilterRadius, MODE_FILTER_PASSES, centroids.length / 3)
    }

    const { labels, areaByRegion, colorIndexByRegion } = labelRegions(paletteIndex, width, height)
    const adjacency = computeAdjacency(labels, width, height)

    let regionForegroundConfidence: Map<number, number> | undefined
    if (options.subjectMask) {
      const mask = options.subjectMask
      const maskSum = new Float64Array(areaByRegion.length)
      for (let i = 0; i < labels.length; i++) maskSum[labels[i]] += mask[i]
      regionForegroundConfidence = new Map()
      for (let id = 0; id < areaByRegion.length; id++) {
        regionForegroundConfidence.set(id, areaByRegion[id] > 0 ? maskSum[id] / areaByRegion[id] / 255 : 0)
      }
    }

    const merge = mergeSmallRegions(areaByRegion, colorIndexByRegion, adjacency, params.minAreaPx, {
      backgroundMinAreaPx: params.backgroundMinAreaPx,
      regionForegroundConfidence,
      paletteLab: centroids,
      backgroundSimilarityDeltaE: params.backgroundSimilarityDeltaE,
      foregroundColorCount,
    })

    return { labels, merge, centroids, regionCount: merge.areaByFinalRegion.size }
  }

  // 2..4 with adaptive retry: too few regions -> more colors + gentler merging;
  //      too many -> merge harder. Bilateral smoothing is shared across attempts.
  const params: AttemptParams = {
    colorCount,
    minAreaPx:
      options.minRegionAreaPx ?? Math.max(width * height * DEFAULT_MIN_AREA_FRACTION, DEFAULT_MIN_AREA_FLOOR_PX),
    backgroundMinAreaPx: options.backgroundMinRegionAreaPx,
    backgroundSimilarityDeltaE: options.backgroundSimilarityDeltaE,
  }
  const target = options.targetRegions
  let attempt = runAttempt(params)
  for (let retry = 1; target && retry < MAX_TARGET_ATTEMPTS; retry++) {
    if (attempt.regionCount < target.min) {
      params.colorCount = Math.round(params.colorCount * 1.5) + 2
      params.minAreaPx *= 0.5
      if (params.backgroundMinAreaPx !== undefined) params.backgroundMinAreaPx *= 0.5
      if (params.backgroundSimilarityDeltaE !== undefined) params.backgroundSimilarityDeltaE *= 0.7
    } else if (attempt.regionCount > target.max) {
      const overshoot = attempt.regionCount / target.max
      params.minAreaPx *= overshoot * 1.2
      if (params.backgroundMinAreaPx !== undefined) params.backgroundMinAreaPx *= overshoot * 1.2
    } else {
      break
    }
    attempt = runAttempt(params)
  }

  const { labels, merge, centroids } = attempt
  const { finalRegionId, areaByFinalRegion, colorIndexByFinalRegion } = merge

  // Renumber surviving root ids to sequential 1..N in raster first-appearance order,
  // accumulating centroid sums in the same pass.
  const sequentialId = new Map<number, number>()
  const sumX = new Map<number, number>()
  const sumY = new Map<number, number>()
  const finalLabels = new Uint32Array(width * height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const root = finalRegionId(labels[i])
      let id = sequentialId.get(root)
      if (id === undefined) {
        id = sequentialId.size + 1
        sequentialId.set(root, id)
      }
      finalLabels[i] = id
      sumX.set(id, (sumX.get(id) ?? 0) + x)
      sumY.set(id, (sumY.get(id) ?? 0) + y)
    }
  }

  // Assign color numbers 1..K' by descending total area across all regions sharing a color.
  const areaByColorIndex = new Map<number, number>()
  for (const [root, area] of areaByFinalRegion) {
    const colorIndex = colorIndexByFinalRegion.get(root)!
    areaByColorIndex.set(colorIndex, (areaByColorIndex.get(colorIndex) ?? 0) + area)
  }
  const colorNumberByColorIndex = new Map<number, number>()
  ;[...areaByColorIndex.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([colorIndex], i) => colorNumberByColorIndex.set(colorIndex, i + 1))

  const palette: Palette = {}
  for (const [colorIndex, colorNumber] of colorNumberByColorIndex) {
    palette[colorNumber] = labToHex(
      centroids[colorIndex * 3],
      centroids[colorIndex * 3 + 1],
      centroids[colorIndex * 3 + 2],
      PALETTE_CHROMA_BOOST,
    )
  }

  const regions: PuzzleRegion[] = []
  for (const [root, id] of sequentialId) {
    const area = areaByFinalRegion.get(root)!
    const colorIndex = colorIndexByFinalRegion.get(root)!
    const colorNumber = colorNumberByColorIndex.get(colorIndex)!

    const cx = Math.round(sumX.get(id)! / area)
    const cy = Math.round(sumY.get(id)! / area)
    const { x: labelX, y: labelY } =
      finalLabels[cy * width + cx] === id
        ? { x: cx, y: cy }
        : findNearestMemberPixel(finalLabels, width, height, id, cx, cy)

    regions.push({ id, colorNumber, labelX, labelY, areaPx: area })
  }
  regions.sort((a, b) => a.id - b.id)

  return {
    width,
    height,
    palette,
    regions,
    labelMap: encodeLabelMap(finalLabels, width, height),
  }
}

export { DIFFICULTY_PARAMS, OUTLINE_PARAMS, effectiveMinArea } from './constants'
export type { DifficultyParams } from './constants'
export { decodeLabelMap } from './rle'
