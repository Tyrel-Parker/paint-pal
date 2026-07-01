import { readdir, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { segmentImage, MAX_DIMENSION, TARGET_COLOR_COUNT, MERGE_THRESHOLD } from '../src/lib/segmentation/index.js'
import { DIFFICULTY_COLOR_RANGE, type Difficulty, type Puzzle } from '../src/types/puzzle.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_DIR = path.join(ROOT, 'source-images')
const PUBLIC_DIR = path.join(ROOT, 'public', 'puzzles')
const IMAGES_DIR = path.join(PUBLIC_DIR, 'images')
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])

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

async function processImage(fileName: string): Promise<Puzzle[]> {
  const inputPath = path.join(SOURCE_DIR, fileName)
  const slug = slugify(fileName)
  const name = humanize(slug)
  const puzzles: Puzzle[] = []

  for (const difficulty of DIFFICULTIES) {
    const id = `${slug}-${difficulty}`
    const { data, info } = await sharp(inputPath)
      .rotate()
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length)
    const { width, height } = info
    const colorCount = TARGET_COLOR_COUNT[difficulty]
    const threshold = MERGE_THRESHOLD[difficulty]
    const minRegionAreaPx = Math.max(width * height * threshold.fraction, threshold.floorPx)

    const result = segmentImage(pixels, width, height, colorCount, { minRegionAreaPx })

    const finalColorCount = Object.keys(result.palette).length
    const [min, max] = DIFFICULTY_COLOR_RANGE[difficulty]
    if (finalColorCount < min || finalColorCount > max) {
      console.warn(
        `  [warn] ${id}: ${finalColorCount} colors after merge (target range ${min}-${max})`,
      )
    }

    const thumbnail = `puzzles/images/${id}-thumb.webp`
    await sharp(inputPath).rotate().resize(240).toFile(path.join(IMAGES_DIR, `${id}-thumb.webp`))

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
    })

    console.log(`  ${id}: ${result.regions.length} regions, ${finalColorCount} colors`)
  }

  return puzzles
}

async function main() {
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
