/**
 * Renders a contact sheet per source image from the generated manifest so
 * pipeline tuning is a repeatable loop: `npm run preprocess && npm run preview:puzzles`,
 * then eyeball preview/<slug>.png.
 *
 * Sheet layout (2 rows x 4 cells):
 *   original      | free-paint outline | easy lines   | easy filled
 *   medium lines  | medium filled      | hard lines   | hard filled
 *
 * The "lines" view is exactly what a kid paints against in numbers mode —
 * if the subject isn't recognizable there, the tier fails.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { decodeLabelMap } from '../src/lib/segmentation/index.js'
import type { Puzzle } from '../src/types/puzzle.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC_DIR = path.join(ROOT, 'public', 'puzzles')
const SOURCE_DIR = path.join(ROOT, 'source-images')
const OUT_DIR = path.join(ROOT, 'preview')

const CELL_WIDTH = 480
const OUTLINE_PIXEL = [45, 45, 45] as const

function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
}

function renderViews(puzzle: Puzzle): { lines: Buffer; filled: Buffer; width: number; height: number } {
  const { width, height } = puzzle
  const labels = decodeLabelMap(puzzle.labelMap)
  const colorByRegion = new Map<number, [number, number, number]>()
  for (const region of puzzle.regions) {
    colorByRegion.set(region.id, hexToRgb(puzzle.palette[region.colorNumber]))
  }

  const lines = new Uint8ClampedArray(width * height * 4).fill(255)
  const filled = new Uint8ClampedArray(width * height * 4)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const label = labels[i]
      const boundary =
        (x < width - 1 && labels[i + 1] !== label) || (y < height - 1 && labels[i + width] !== label)
      const o = i * 4

      if (boundary) {
        lines[o] = OUTLINE_PIXEL[0]
        lines[o + 1] = OUTLINE_PIXEL[1]
        lines[o + 2] = OUTLINE_PIXEL[2]
      }

      const rgb = boundary ? [0, 0, 0] : (colorByRegion.get(label) ?? [255, 0, 255])
      filled[o] = rgb[0]
      filled[o + 1] = rgb[1]
      filled[o + 2] = rgb[2]
      filled[o + 3] = 255
    }
  }

  return { lines: Buffer.from(lines.buffer), filled: Buffer.from(filled.buffer), width, height }
}

async function toCell(input: sharp.Sharp, cellHeight: number): Promise<Buffer> {
  return input
    .resize(CELL_WIDTH, cellHeight, { fit: 'contain', background: '#ffffff' })
    .removeAlpha()
    .png()
    .toBuffer()
}

async function buildSheet(slug: string, puzzles: Puzzle[]) {
  const byDifficulty = new Map(puzzles.map((p) => [p.difficulty, p]))
  const medium = byDifficulty.get('medium') ?? puzzles[0]
  const cellHeight = Math.round((CELL_WIDTH * medium.height) / medium.width)

  const slugOf = (f: string) =>
    f
      .replace(/\.[^.]*$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  const sourceFile = (await import('node:fs')).readdirSync(SOURCE_DIR).find((f) => slugOf(f) === slug)

  const cells: Buffer[] = []
  cells.push(
    sourceFile
      ? await toCell(sharp(path.join(SOURCE_DIR, sourceFile)).rotate(), cellHeight)
      : await toCell(sharp({ create: { width: CELL_WIDTH, height: cellHeight, channels: 3, background: '#dddddd' } }), cellHeight),
  )
  cells.push(
    await toCell(sharp(path.join(ROOT, 'public', medium.outline)).flatten({ background: '#ffffff' }), cellHeight),
  )

  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    const puzzle = byDifficulty.get(difficulty)
    if (!puzzle) continue
    const { lines, filled, width, height } = renderViews(puzzle)
    const raw = { raw: { width, height, channels: 4 as const } }
    cells.push(await toCell(sharp(lines, raw), cellHeight))
    cells.push(await toCell(sharp(filled, raw), cellHeight))
  }

  const cols = 4
  const rows = Math.ceil(cells.length / cols)
  const sheet = sharp({
    create: { width: CELL_WIDTH * cols, height: cellHeight * rows, channels: 3, background: '#ffffff' },
  }).composite(
    cells.map((buffer, i) => ({
      input: buffer,
      left: (i % cols) * CELL_WIDTH,
      top: Math.floor(i / cols) * cellHeight,
    })),
  )

  await sheet.png().toFile(path.join(OUT_DIR, `${slug}.png`))
}

async function main() {
  const manifest: Puzzle[] = JSON.parse(await readFile(path.join(PUBLIC_DIR, 'manifest.json'), 'utf8'))
  await mkdir(OUT_DIR, { recursive: true })

  const bySlug = new Map<string, Puzzle[]>()
  for (const puzzle of manifest) {
    const slug = puzzle.id.replace(/-(easy|medium|hard)$/, '')
    bySlug.set(slug, [...(bySlug.get(slug) ?? []), puzzle])
  }

  const summary: string[] = []
  for (const [slug, puzzles] of bySlug) {
    await buildSheet(slug, puzzles)
    const stats = puzzles
      .map((p) => `${p.difficulty}: ${p.regions.length} regions / ${Object.keys(p.palette).length} colors`)
      .join(', ')
    summary.push(`${slug} — ${stats}`)
    console.log(`preview/${slug}.png  (${stats})`)
  }
  await writeFile(path.join(OUT_DIR, 'summary.txt'), summary.join('\n') + '\n')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
