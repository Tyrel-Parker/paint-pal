import { readdir, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  segmentImage,
  DIFFICULTY_PARAMS,
  OUTLINE_PARAMS,
  effectiveMinArea,
} from '../src/lib/segmentation/index.js'
import { generateOutline } from '../src/lib/outline.js'
import { resizeMaskNearest } from '../src/lib/subjectMask.js'
import type { Difficulty, Puzzle } from '../src/types/puzzle.js'

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
  // 'medium' is noticeably better at complex silhouettes (castle spires, legs)
  // than 'small', and build time doesn't care about the extra model weight.
  const blob = await segmentForeground(inputPath, { model: 'medium', output: { format: 'image/png' } })
  const buf = Buffer.from(await blob.arrayBuffer())
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

  const alpha = new Uint8Array(info.width * info.height)
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]
  return { data: alpha, width: info.width, height: info.height }
}

async function generateOutlineAsset(inputPath: string, slug: string, mask: SubjectMask) {
  const maxDimension = OUTLINE_PARAMS.maxDimension
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
    const params = DIFFICULTY_PARAMS[difficulty]
    const { data, info } = await sharp(inputPath)
      .rotate()
      .resize(params.maxDimension, params.maxDimension, { fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length)
    const { width, height } = info
    const subjectMask = resizeMaskNearest(mask.data, mask.width, mask.height, width, height)

    const result = segmentImage(pixels, width, height, params.colorCount, {
      minRegionAreaPx: effectiveMinArea(params.minRegionArea, width, height),
      backgroundMinRegionAreaPx: effectiveMinArea(params.backgroundMinRegionArea, width, height),
      subjectMask,
      backgroundSimilarityDeltaE: params.backgroundSimilarityDeltaE,
      smoothing: params.smoothing,
      modeFilterRadius: params.modeFilterRadius,
      targetRegions: params.targetRegions,
    })

    const finalColorCount = Object.keys(result.palette).length

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

const CACHE_PATH = path.join(PUBLIC_DIR, 'preprocess-cache.json')
const MANIFEST_PATH = path.join(PUBLIC_DIR, 'manifest.json')
const DIFFICULTY_COUNT = DIFFICULTIES.length

/** slug -> sha1 of the source file it was last processed from. */
type Cache = Record<string, string>

async function loadJson<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T
  } catch {
    return undefined
  }
}

function generatedAssetsExist(slug: string): boolean {
  return (
    existsSync(path.join(IMAGES_DIR, `${slug}-outline.png`)) &&
    existsSync(path.join(IMAGES_DIR, `${slug}-thumb.webp`))
  )
}

/**
 * Incremental by default: images whose content hash matches the cache and
 * whose generated assets are all present are skipped. `--force` reprocesses
 * everything — run it after changing pipeline code, since code changes don't
 * show up in source hashes.
 */
async function main() {
  const force = process.argv.includes('--force')
  await mkdir(IMAGES_DIR, { recursive: true })

  const entries = await readdir(SOURCE_DIR)
  const imageFiles = entries.filter((entry) => IMAGE_EXTENSIONS.has(path.extname(entry).toLowerCase()))

  if (imageFiles.length === 0) {
    console.log('No images found in source-images/. Drop some in and re-run.')
    return
  }

  const cache = (!force && (await loadJson<Cache>(CACHE_PATH))) || {}
  const existingManifest = (!force && (await loadJson<Puzzle[]>(MANIFEST_PATH))) || []
  const manifestBySlug = new Map<string, Puzzle[]>()
  for (const puzzle of existingManifest) {
    const slug = puzzle.id.replace(/-(easy|medium|hard)$/, '')
    manifestBySlug.set(slug, [...(manifestBySlug.get(slug) ?? []), puzzle])
  }

  const nextCache: Cache = {}
  const manifest: Puzzle[] = []
  const pending: Array<{ fileName: string; slug: string; hash: string }> = []
  let skipped = 0

  for (const fileName of imageFiles) {
    const slug = slugify(fileName)
    const hash = createHash('sha1')
      .update(await readFile(path.join(SOURCE_DIR, fileName)))
      .digest('hex')
    const cachedEntries = manifestBySlug.get(slug)
    if (cache[slug] === hash && cachedEntries?.length === DIFFICULTY_COUNT && generatedAssetsExist(slug)) {
      manifest.push(...cachedEntries)
      nextCache[slug] = hash
      skipped++
    } else {
      pending.push({ fileName, slug, hash })
    }
  }

  if (pending.length > 0) {
    // Deferred until we know there's work: loading these is slow, and the
    // import order matters (see the comment on the declarations above).
    ;({ segmentForeground } = await import('@imgly/background-removal-node'))
    sharp = (await import('sharp')).default

    for (const { fileName, slug, hash } of pending) {
      console.log(`Processing ${fileName}...`)
      manifest.push(...(await processImage(fileName)))
      nextCache[slug] = hash
    }
  }

  // Drop generated assets for source images that no longer exist.
  const liveSlugs = new Set(imageFiles.map(slugify))
  for (const slug of manifestBySlug.keys()) {
    if (liveSlugs.has(slug)) continue
    console.log(`Removing assets for deleted image "${slug}"`)
    await rm(path.join(IMAGES_DIR, `${slug}-outline.png`), { force: true })
    await rm(path.join(IMAGES_DIR, `${slug}-thumb.webp`), { force: true })
  }

  manifest.sort((a, b) => a.id.localeCompare(b.id))
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest))
  await writeFile(CACHE_PATH, JSON.stringify(nextCache, null, 2) + '\n')
  console.log(
    `\nManifest: ${manifest.length} puzzles from ${imageFiles.length} image(s) ` +
      `(${pending.length} processed, ${skipped} up to date)`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
