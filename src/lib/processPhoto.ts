import { segmentImage, MAX_DIMENSION, MERGE_THRESHOLD, BACKGROUND_MERGE_THRESHOLD } from './segmentation'
import type { Difficulty, Puzzle } from '../types/puzzle'
import { TARGET_COLOR_COUNT } from './segmentation/constants'
import { generateOutline } from './outline'
import { resizeMaskNearest } from './subjectMask'

function drawToCanvas(bitmap: ImageBitmap, maxDimension: number) {
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.drawImage(bitmap, 0, 0, width, height)
  return { canvas, ctx, width, height }
}

interface SubjectMask {
  data: Uint8Array
  width: number
  height: number
}

/**
 * Foreground confidence mask at the photo's native resolution; resize per use
 * with resizeMaskNearest. Dynamically imported so the ~40MB model is never
 * downloaded by anyone who doesn't use this (still-dormant) code path.
 */
async function acquireSubjectMask(file: File): Promise<SubjectMask> {
  const { segmentForeground } = await import('@imgly/background-removal')
  // Browser package's model options differ from the Node package's ('small'/'medium'/'large') —
  // confirmed via its schema.d.ts rather than assumed. quint8 is the smallest/fastest variant.
  const blob = await segmentForeground(file, { model: 'isnet_quint8', output: { format: 'image/png' } })
  const bitmap = await createImageBitmap(blob)
  const { ctx, width, height } = drawToCanvas(bitmap, Math.max(bitmap.width, bitmap.height))
  const { data } = ctx.getImageData(0, 0, width, height)

  const alpha = new Uint8Array(width * height)
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]
  return { data: alpha, width, height }
}

/**
 * Browser counterpart to scripts/preprocess.ts — same shared `segmentImage`
 * core, but decodes via canvas instead of sharp. Not yet wired to an "add
 * your own photo" UI; that's future work once the puzzle-painting screen
 * exists to send the result to.
 */
export async function processPhoto(file: File, difficulty: Difficulty, id: string, name: string): Promise<Puzzle> {
  const bitmap = await createImageBitmap(file)
  const mask = await acquireSubjectMask(file)

  const { canvas, ctx, width, height } = drawToCanvas(bitmap, MAX_DIMENSION[difficulty])
  const { data } = ctx.getImageData(0, 0, width, height)
  const threshold = MERGE_THRESHOLD[difficulty]
  const backgroundThreshold = BACKGROUND_MERGE_THRESHOLD[difficulty]
  const subjectMask = resizeMaskNearest(mask.data, mask.width, mask.height, width, height)
  const result = segmentImage(data, width, height, TARGET_COLOR_COUNT[difficulty], {
    minRegionAreaPx: Math.max(width * height * threshold.fraction, threshold.floorPx),
    backgroundMinRegionAreaPx: Math.max(width * height * backgroundThreshold.fraction, backgroundThreshold.floorPx),
    subjectMask,
  })

  // Browsers without WebP export silently fall back to PNG here rather than throwing.
  const thumbnail = canvas.toDataURL('image/webp', 0.8)

  // Outline is difficulty-independent, so it's generated at its own fixed resolution.
  const outlineCanvas = drawToCanvas(bitmap, MAX_DIMENSION.medium)
  const outlinePixels = outlineCanvas.ctx.getImageData(0, 0, outlineCanvas.width, outlineCanvas.height)
  const outlineMask = resizeMaskNearest(mask.data, mask.width, mask.height, outlineCanvas.width, outlineCanvas.height)
  const outlineRgba = generateOutline(outlinePixels.data, outlineCanvas.width, outlineCanvas.height, {
    subjectMask: outlineMask,
  })
  outlineCanvas.ctx.putImageData(new ImageData(outlineRgba, outlineCanvas.width, outlineCanvas.height), 0, 0)
  const outline = outlineCanvas.canvas.toDataURL('image/png')

  return {
    id,
    name,
    difficulty,
    width,
    height,
    labelMap: result.labelMap,
    regions: result.regions,
    palette: result.palette,
    source: 'user',
    thumbnail,
    outline,
    outlineWidth: outlineCanvas.width,
    outlineHeight: outlineCanvas.height,
  }
}
