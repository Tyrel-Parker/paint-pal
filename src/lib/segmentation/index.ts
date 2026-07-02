import type { Palette, PuzzleRegion } from '../../types/puzzle'
import { quantizeImage } from './quantize'
import { smoothPaletteIndex } from './smooth'
import { labelRegions, computeAdjacency } from './connectedComponents'
import { mergeSmallRegions } from './mergeSmallRegions'
import { encodeLabelMap } from './rle'
import type { SegmentationOptions, SegmentationResult } from './types'

const DEFAULT_MIN_AREA_FRACTION = 0.004
const DEFAULT_MIN_AREA_FLOOR_PX = 150

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
  const { paletteIndex, paletteColors } = quantizeImage(pixels, width, height, colorCount)
  const smoothedIndex = smoothPaletteIndex(paletteIndex, width, height, 2)
  const { labels, areaByRegion, colorIndexByRegion } = labelRegions(smoothedIndex, width, height)
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
    { backgroundMinAreaPx: options.backgroundMinRegionAreaPx, regionForegroundConfidence },
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
    palette[colorNumber] = paletteColors[colorIndex]
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

export { MAX_DIMENSION, TARGET_COLOR_COUNT, MERGE_THRESHOLD, BACKGROUND_MERGE_THRESHOLD } from './constants'
export { decodeLabelMap } from './rle'
