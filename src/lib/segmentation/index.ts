import type { Palette, PuzzleRegion } from '../../types/puzzle'
import { rgbaToLab, labToHex } from './lab'
import { smoothLab } from './bilateral'
import { buildPaletteKMeans, assignToPalette } from './kmeans'
import { modeFilter } from './modeFilter'
import { labelRegions, computeAdjacency } from './connectedComponents'
import { mergeSmallRegions } from './mergeSmallRegions'
import { encodeLabelMap } from './rle'
import type { SegmentationOptions, SegmentationResult } from './types'

const DEFAULT_MIN_AREA_FRACTION = 0.004
const DEFAULT_MIN_AREA_FLOOR_PX = 150
const DEFAULT_SMOOTHING = { iterations: 5, rangeSigma: 11 }
const DEFAULT_MODE_FILTER_RADIUS = 3
const MODE_FILTER_PASSES = 2
const DEFAULT_SUBJECT_WEIGHT = 3
/** Final palette colors get a slight chroma push — the bilateral flattening desaturates a touch. */
const PALETTE_CHROMA_BOOST = 1.12

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
  const subjectWeight = options.subjectWeight ?? DEFAULT_SUBJECT_WEIGHT

  // 1. Perceptual color space + edge-preserving smoothing: flatten texture and
  //    lighting gradients so everything downstream follows object structure.
  const lab = rgbaToLab(pixels, size)
  const smoothed = smoothLab(lab, width, height, smoothing)

  // 2. Palette via weighted k-means: subject pixels count more, so palette
  //    diversity goes to the subject instead of sky/grass.
  let weights: Float32Array | undefined
  if (options.subjectMask && subjectWeight > 1) {
    const mask = options.subjectMask
    weights = new Float32Array(size)
    for (let i = 0; i < size; i++) weights[i] = 1 + (mask[i] / 255) * (subjectWeight - 1)
  }
  const centroids = buildPaletteKMeans(smoothed, size, colorCount, weights)
  const paletteColorCount = centroids.length / 3

  // 3. Per-pixel assignment + mode-filter boundary cleanup.
  let paletteIndex = assignToPalette(smoothed, size, centroids)
  paletteIndex = modeFilter(paletteIndex, width, height, modeFilterRadius, MODE_FILTER_PASSES, paletteColorCount)

  // 4. Regions: connected components, then merge-away of too-small regions
  //    (into the nearest-colored neighbor) with subject-aware thresholds.
  const { labels, areaByRegion, colorIndexByRegion } = labelRegions(paletteIndex, width, height)
  const adjacency = computeAdjacency(labels, width, height)

  const minAreaPx =
    options.minRegionAreaPx ??
    Math.max(width * height * DEFAULT_MIN_AREA_FRACTION, DEFAULT_MIN_AREA_FLOOR_PX)

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

  const { finalRegionId, areaByFinalRegion, colorIndexByFinalRegion } = mergeSmallRegions(
    areaByRegion,
    colorIndexByRegion,
    adjacency,
    minAreaPx,
    {
      backgroundMinAreaPx: options.backgroundMinRegionAreaPx,
      regionForegroundConfidence,
      paletteLab: centroids,
      backgroundSimilarityDeltaE: options.backgroundSimilarityDeltaE,
    },
  )

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
