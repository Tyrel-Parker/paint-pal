import { segmentImage, DIFFICULTY_PARAMS, OUTLINE_PARAMS, effectiveMinArea } from './segmentation'
import type { Difficulty, Puzzle } from '../types/puzzle'
import { generateOutline } from './outline'
import { resizeMaskNearest } from './subjectMask'

export type ProcessStage = 'loading-model' | 'finding-subject' | Difficulty | 'outline'

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']
const THUMBNAIL_WIDTH = 240

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

/** Let the browser paint pending UI updates before the next long synchronous stage. */
function yieldToUI(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

interface SubjectMask {
  data: Uint8Array
  width: number
  height: number
}

/**
 * Foreground confidence mask at the photo's native resolution; resize per use
 * with resizeMaskNearest. The model import stays dynamic so the ~40MB model is
 * only ever downloaded by someone who actually adds a photo.
 */
async function acquireSubjectMask(file: File, onProgress: (stage: ProcessStage) => void): Promise<SubjectMask> {
  onProgress('loading-model')
  const { segmentForeground } = await import('@imgly/background-removal')
  onProgress('finding-subject')
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
 * core, but decodes via canvas instead of sharp. Produces all three
 * difficulty variants plus the shared Free Paint outline from a single decode
 * and a single subject-mask model run.
 */
export async function processPhotoAll(
  file: File,
  baseId: string,
  name: string,
  onProgress: (stage: ProcessStage) => void = () => {},
): Promise<Puzzle[]> {
  const bitmap = await createImageBitmap(file)
  const mask = await acquireSubjectMask(file, onProgress)

  // Outline is difficulty-independent, generated once at its own resolution.
  onProgress('outline')
  await yieldToUI()
  const outlineCanvas = drawToCanvas(bitmap, OUTLINE_PARAMS.maxDimension)
  const outlinePixels = outlineCanvas.ctx.getImageData(0, 0, outlineCanvas.width, outlineCanvas.height)
  const outlineMask = resizeMaskNearest(mask.data, mask.width, mask.height, outlineCanvas.width, outlineCanvas.height)
  const outlineRgba = generateOutline(outlinePixels.data, outlineCanvas.width, outlineCanvas.height, {
    subjectMask: outlineMask,
  })
  outlineCanvas.ctx.putImageData(new ImageData(outlineRgba, outlineCanvas.width, outlineCanvas.height), 0, 0)
  const outline = outlineCanvas.canvas.toDataURL('image/png')

  const thumbCanvas = drawToCanvas(bitmap, THUMBNAIL_WIDTH)
  // Browsers without WebP export silently fall back to PNG here rather than throwing.
  const thumbnail = thumbCanvas.canvas.toDataURL('image/webp', 0.8)

  const puzzles: Puzzle[] = []
  for (const difficulty of DIFFICULTIES) {
    onProgress(difficulty)
    await yieldToUI()

    const params = DIFFICULTY_PARAMS[difficulty]
    const { ctx, width, height } = drawToCanvas(bitmap, params.maxDimension)
    const { data } = ctx.getImageData(0, 0, width, height)
    const subjectMask = resizeMaskNearest(mask.data, mask.width, mask.height, width, height)

    const result = segmentImage(data, width, height, params.colorCount, {
      minRegionAreaPx: effectiveMinArea(params.minRegionArea, width, height),
      backgroundMinRegionAreaPx: effectiveMinArea(params.backgroundMinRegionArea, width, height),
      subjectMask,
      backgroundSimilarityDeltaE: params.backgroundSimilarityDeltaE,
      smoothing: params.smoothing,
      modeFilterRadius: params.modeFilterRadius,
      targetRegions: params.targetRegions,
    })

    puzzles.push({
      id: `${baseId}-${difficulty}`,
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
    })
  }

  return puzzles
}
