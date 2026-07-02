import { readdir, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  segmentImage,
  MAX_DIMENSION,
  TARGET_COLOR_COUNT,
  MERGE_THRESHOLD,
  BACKGROUND_MERGE_THRESHOLD,
} from '../src/lib/segmentation/index.js'
import { generateOutline } from '../src/lib/outline.js'
import { resizeMaskNearest } from '../src/lib/subjectMask.js'
import { DIFFICULTY_COLOR_RANGE, type Difficulty, type Puzzle } from '../src/types/puzzle.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_DIR = path.join(ROOT, 'source-images')
const PUBLIC_DIR = path.join(ROOT, 'public', 'puzzles')
const IMAGES_DIR = path.join(PUBLIC_DIR, 'images')
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])

// Both resolved once in main(), in this order, before any other code touches either module.
// @imgly/background-removal-node bundles its own sharp build; loading our sharp first causes
// a native "free(): invalid size" crash from the two colliding — confirmed by isolating the
// exact failing combination with a throwaway script before writing this workaround.
let sharp: typeof import('sharp')['default']
let segmentForeground: typeof import('@imgly/background-removal-node')['segmentForeground']

function slugify(fileName: string): string {
  return path
    .basename(fileName, path.extname(fileName))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function humanize(slug: string): string {
  return slug.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ')
}

interface SubjectMask {
  data: Uint8Array
  width: number
  height: number
}

/** Foreground confidence mask at the photo's native resolution; resize per use with resizeMaskNearest. */
async function acquireSubjectMask(inputPath: string): Promise<SubjectMask> {
  const blob = await segmentForeground(inputPath, { model: 'small', output: { format: 'image/png' } })
  const buf = Buffer.from(await blob.arrayBuffer())
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

  const alpha = new Uint8Array(info.width * info.height)
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]
  return { data: alpha, width: info.width, height: info.height }
}

async function generateOutlineAsset(inputPath: string, slug: string, mask: SubjectMask) {
  const maxDimension = MAX_DIMENSION.medium
  const { data, info } = await sharp(inputPath)
    .rotate()
    .resize(maxDimension, maxDimension, { fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length)
  const { width, height } = info
  const subjectMask = resizeMaskNearest(mask.data, mask.width, mask.height, width, height)
  const outlineRgba = generateOutline(pixels, width, height, { subjectMask })

  const outline = `puzzles/images/${slug}-outline.png`
  await sharp(Buffer.from(outlineRgba), { raw: { width, height, channels: 4 } })
    .png()
    .toFile(path.join(IMAGES_DIR, `${slug}-outline.png`))

  return { outline, outlineWidth: width, outlineHeight: height }
}

async function processImage(fileName: string): Promise<Puzzle[]> {
  const inputPath = path.join(SOURCE_DIR, fileName)
  const slug = slugify(fileName)
  const name = humanize(slug)
  const puzzles: Puzzle[] = []

  const thumbnail = `puzzles/images/${slug}-thumb.webp`
  await sharp(inputPath).rotate().resize(240).toFile(path.join(IMAGES_DIR, `${slug}-thumb.webp`))

  const mask = await acquireSubjectMask(inputPath)
  const { outline, outlineWidth, outlineHeight } = await generateOutlineAsset(inputPath, slug, mask)

  for (const difficulty of DIFFICULTIES) {
    const id = `${slug}-${difficulty}`
    const maxDimension = MAX_DIMENSION[difficulty]
    const { data, info } = await sharp(inputPath)
      .rotate()
      .resize(maxDimension, maxDimension, { fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length)
    const { width, height } = info
    const colorCount = TARGET_COLOR_COUNT[difficulty]
    const threshold = MERGE_THRESHOLD[difficulty]
    const backgroundThreshold = BACKGROUND_MERGE_THRESHOLD[difficulty]
    const minRegionAreaPx = Math.max(width * height * threshold.fraction, threshold.floorPx)
    const backgroundMinRegionAreaPx = Math.max(width * height * backgroundThreshold.fraction, backgroundThreshold.floorPx)
    const subjectMask = resizeMaskNearest(mask.data, mask.width, mask.height, width, height)

    const result = segmentImage(pixels, width, height, colorCount, {
      minRegionAreaPx,
      backgroundMinRegionAreaPx,
      subjectMask,
    })

    const finalColorCount = Object.keys(result.palette).length
    const [min, max] = DIFFICULTY_COLOR_RANGE[difficulty]
    if (finalColorCount < min || finalColorCount > max) {
      console.warn(
        `  [warn] ${id}: ${finalColorCount} colors after merge (target range ${min}-${max})`,
      )
    }

    puzzles.push({
      id,
      name,
      difficulty,
      width,
      height,
      labelMap: result.labelMap,
      regions: result.regions,
      palette: result.palette,
      source: 'builtin',
      thumbnail,
      outline,
      outlineWidth,
      outlineHeight,
    })

    console.log(`  ${id}: ${result.regions.length} regions, ${finalColorCount} colors`)
  }

  return puzzles
}

async function main() {
  ;({ segmentForeground } = await import('@imgly/background-removal-node'))
  sharp = (await import('sharp')).default

  await mkdir(IMAGES_DIR, { recursive: true })

  const entries = await readdir(SOURCE_DIR)
  const imageFiles = entries.filter((entry) => IMAGE_EXTENSIONS.has(path.extname(entry).toLowerCase()))

  if (imageFiles.length === 0) {
    console.log('No images found in source-images/. Drop some in and re-run.')
    return
  }

  const manifest: Puzzle[] = []
  for (const fileName of imageFiles) {
    console.log(`Processing ${fileName}...`)
    manifest.push(...(await processImage(fileName)))
  }

  await writeFile(path.join(PUBLIC_DIR, 'manifest.json'), JSON.stringify(manifest))
  console.log(`\nWrote ${manifest.length} puzzles from ${imageFiles.length} image(s) to public/puzzles/manifest.json`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
