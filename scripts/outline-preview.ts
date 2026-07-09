/**
 * Regenerates ONLY the Free Paint outline for the named source images —
 * much faster than a full preprocess when tuning outline code. PNGs go to
 * preview/ (white-flattened for inspection).
 *
 *   npx tsx scripts/outline-preview.ts bear castle cat
 */
import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { generateOutline } from '../src/lib/outline.js'
import { generateLineArtAlpha } from '../src/lib/lineart.js'
import { OUTLINE_PARAMS } from '../src/lib/segmentation/index.js'
import { resizeMaskNearest } from '../src/lib/subjectMask.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'preview')
const MODEL_PATH = path.join(ROOT, 'public', 'models', 'line-art.onnx')

async function main() {
  const { segmentForeground } = await import('@imgly/background-removal-node')
  const sharp = (await import('sharp')).default
  const ortModule = await import('onnxruntime-node')
  const ort = ortModule.default ?? ortModule
  const session = await ort.InferenceSession.create(MODEL_PATH)
  const io = {
    async run(input: Float32Array, dims: number[]) {
      const results = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', input, dims) })
      const output = results[session.outputNames[0]]
      return { data: output.data as Float32Array, dims: output.dims }
    },
  }
  await mkdir(OUT, { recursive: true })

  const names = process.argv.slice(2)
  if (names.length === 0) {
    console.log('Usage: npx tsx scripts/outline-preview.ts <image-name> [...]')
    return
  }

  for (const name of names) {
    const input = path.join(ROOT, 'source-images', `${name}.jpg`)
    const blob = await segmentForeground(input, { model: 'medium', output: { format: 'image/png' } })
    const maskBuf = Buffer.from(await blob.arrayBuffer())
    const maskRaw = await sharp(maskBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const alpha = new Uint8Array(maskRaw.info.width * maskRaw.info.height)
    for (let i = 0; i < alpha.length; i++) alpha[i] = maskRaw.data[i * 4 + 3]

    const dim = OUTLINE_PARAMS.maxDimension
    const { data, info } = await sharp(input)
      .rotate()
      .resize(dim, dim, { fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length)
    const subjectMask = resizeMaskNearest(alpha, maskRaw.info.width, maskRaw.info.height, info.width, info.height)

    const t = Date.now()
    const lineArtAlpha = await generateLineArtAlpha(pixels, info.width, info.height, io)
    const rgba = generateOutline(pixels, info.width, info.height, { subjectMask, lineArtAlpha })
    console.log(`${name}: outline in ${Date.now() - t}ms -> preview/outline-${name}.png`)
    await sharp(Buffer.from(rgba), { raw: { width: info.width, height: info.height, channels: 4 } })
      .flatten({ background: '#ffffff' })
      .png()
      .toFile(path.join(OUT, `outline-${name}.png`))
  }
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
