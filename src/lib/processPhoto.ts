import { segmentImage, MAX_DIMENSION } from './segmentation'
import type { Difficulty, Puzzle } from '../types/puzzle'
import { TARGET_COLOR_COUNT } from './segmentation/constants'

/**
 * Browser counterpart to scripts/preprocess.ts — same shared `segmentImage`
 * core, but decodes via canvas instead of sharp. Not yet wired to an "add
 * your own photo" UI; that's future work once the puzzle-painting screen
 * exists to send the result to.
 */
export async function processPhoto(file: File, difficulty: Difficulty, id: string, name: string): Promise<Puzzle> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIMENSION[difficulty] / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.drawImage(bitmap, 0, 0, width, height)

  const { data } = ctx.getImageData(0, 0, width, height)
  const result = segmentImage(data, width, height, TARGET_COLOR_COUNT[difficulty])

  // Browsers without WebP export silently fall back to PNG here rather than throwing.
  const thumbnail = canvas.toDataURL('image/webp', 0.8)

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
  }
}
