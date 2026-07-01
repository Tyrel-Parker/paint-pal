import type { LabelMapRLE, PuzzleRegion } from '../types/puzzle'
import { decodeLabelMap } from './segmentation/rle'

export interface RegionIndex {
  labels: Uint32Array
  width: number
  height: number
  /** Dilated boundary mask; pixels here are never part of a region's fillable list. */
  isOutline: Uint8Array
  /** CSR row pointers, length = maxRegionId + 2. */
  regionPixelOffsets: Uint32Array
  /** Flattened per-region pixel indices (outline pixels excluded), grouped by region id. */
  regionPixelIndices: Uint32Array
}

function computeBaseOutline(labels: Uint32Array, width: number, height: number): Uint8Array {
  const outline = new Uint8Array(labels.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const label = labels[i]
      if (x < width - 1 && labels[i + 1] !== label) {
        outline[i] = 1
        outline[i + 1] = 1
      }
      if (y < height - 1 && labels[i + width] !== label) {
        outline[i] = 1
        outline[i + width] = 1
      }
    }
  }
  return outline
}

function dilate(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (mask[i]) continue
      const hit =
        (x > 0 && mask[i - 1]) ||
        (x < width - 1 && mask[i + 1]) ||
        (y > 0 && mask[i - width]) ||
        (y < height - 1 && mask[i + width])
      if (hit) out[i] = 1
    }
  }
  return out
}

/** dilatePasses of 1 gives a ~2px-wide outline (1px base detection + 1px growth), enough to stay visible after phone-scale up/downscaling. */
export function buildRegionIndex(rle: LabelMapRLE, dilatePasses = 1): RegionIndex {
  const { width, height } = rle
  const labels = decodeLabelMap(rle)

  let isOutline = computeBaseOutline(labels, width, height)
  for (let i = 0; i < dilatePasses; i++) {
    isOutline = dilate(isOutline, width, height)
  }

  let maxRegionId = 0
  for (const id of labels) if (id > maxRegionId) maxRegionId = id

  const counts = new Uint32Array(maxRegionId + 2)
  for (let i = 0; i < labels.length; i++) {
    if (isOutline[i]) continue
    counts[labels[i]]++
  }

  const regionPixelOffsets = new Uint32Array(maxRegionId + 2)
  for (let id = 1; id <= maxRegionId; id++) {
    regionPixelOffsets[id + 1] = regionPixelOffsets[id] + counts[id]
  }

  const cursors = regionPixelOffsets.slice()
  const regionPixelIndices = new Uint32Array(regionPixelOffsets[maxRegionId + 1])
  for (let i = 0; i < labels.length; i++) {
    if (isOutline[i]) continue
    const id = labels[i]
    regionPixelIndices[cursors[id]++] = i
  }

  return { labels, width, height, isOutline, regionPixelOffsets, regionPixelIndices }
}

function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
}

const DEFAULT_UNFILLED = '#ffffff'
const DEFAULT_OUTLINE = '#2b2b2b'

export function paintFullBuffer(
  imageData: ImageData,
  index: RegionIndex,
  filled: Record<number, string>,
  unfilledColor = DEFAULT_UNFILLED,
  outlineColor = DEFAULT_OUTLINE,
): void {
  const { data } = imageData
  const [ur, ug, ub] = hexToRgb(unfilledColor)
  const [or_, og, ob] = hexToRgb(outlineColor)
  const fillRgb = new Map<string, [number, number, number]>()

  for (let i = 0; i < index.labels.length; i++) {
    const o = i * 4
    if (index.isOutline[i]) {
      data[o] = or_
      data[o + 1] = og
      data[o + 2] = ob
      data[o + 3] = 255
      continue
    }
    const hex = filled[index.labels[i]]
    let rgb: [number, number, number]
    if (hex === undefined) {
      rgb = [ur, ug, ub]
    } else {
      let cached = fillRgb.get(hex)
      if (!cached) {
        cached = hexToRgb(hex)
        fillRgb.set(hex, cached)
      }
      rgb = cached
    }
    data[o] = rgb[0]
    data[o + 1] = rgb[1]
    data[o + 2] = rgb[2]
    data[o + 3] = 255
  }
}

export function paintRegionFill(imageData: ImageData, index: RegionIndex, regionId: number, colorHex: string): void {
  const { data } = imageData
  const [r, g, b] = hexToRgb(colorHex)
  const start = index.regionPixelOffsets[regionId]
  const end = index.regionPixelOffsets[regionId + 1]
  for (let p = start; p < end; p++) {
    const o = index.regionPixelIndices[p] * 4
    data[o] = r
    data[o + 1] = g
    data[o + 2] = b
    data[o + 3] = 255
  }
}

export function findRegionAtPixel(index: RegionIndex, x: number, y: number): number | undefined {
  if (x < 0 || y < 0 || x >= index.width || y >= index.height) return undefined
  return index.labels[y * index.width + x]
}

export function drawRegionLabels(ctx: CanvasRenderingContext2D, regions: PuzzleRegion[]): void {
  ctx.save()
  ctx.font = 'bold 22px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 3
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.fillStyle = '#2b2b2b'
  for (const region of regions) {
    const label = String(region.colorNumber)
    ctx.strokeText(label, region.labelX, region.labelY)
    ctx.fillText(label, region.labelX, region.labelY)
  }
  ctx.restore()
}
