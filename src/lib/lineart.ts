/**
 * Learned photo→line-drawing for the Free Paint outline, using the
 * informative-drawings model (Chan et al. 2022, MIT; ONNX port by
 * josephrocca — huggingface.co/rocca/informative-drawings-line-art-onnx,
 * self-hosted at public/models/line-art.onnx). It draws what an illustrator
 * would: fur strokes, windows, cloud contours — detail no classical edge
 * pipeline reached.
 *
 * This module is runtime-agnostic pre/post-processing; the caller supplies
 * the ONNX session (onnxruntime-node at build time, onnxruntime-web on
 * device).
 */

/** Minimal session adapter so Node and browser runtimes plug in identically. */
export interface LineArtModelIO {
  /** input: CHW float32 RGB in 0..1, dims [1,3,H,W]; returns [1,1,H,W] where 1 = paper, 0 = ink. */
  run(input: Float32Array, dims: number[]): Promise<{ data: Float32Array; dims: readonly number[] }>
}

/** Model output near the frame edge is unreliable (dark smears). */
const BORDER_PX = 8
/** Darkness below this is paper noise, ignored when normalizing. */
const DARKNESS_FLOOR = 0.08
/** Normalization cap: p95 of darkness, but never below this (avoids amplifying pure noise). */
const P95_MIN = 0.35
/** After normalization: ink starts at this darkness and ramps to fully opaque over RAMP. */
const INK_THRESHOLD = 0.45
const INK_RAMP = 0.3

/**
 * Runs the model on an RGBA buffer and returns a per-pixel ink alpha
 * (0-255) at the same dimensions. The soft pencil output is converted to
 * coloring-book ink with a per-image adaptive curve: darkness is normalized
 * by its 95th percentile, so faint drawings (hazy photos) get boosted and
 * heavy shading (dense trees) doesn't become solid black.
 */
export async function generateLineArtAlpha(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  io: LineArtModelIO,
): Promise<Uint8Array> {
  // The generator downsamples by 4 internally; crop a few edge pixels so dims divide evenly.
  const w = width - (width % 4)
  const h = height - (height % 4)

  const chw = new Float32Array(3 * h * w)
  const plane = h * w
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * width + x) * 4
      const i = y * w + x
      chw[i] = pixels[o] / 255
      chw[plane + i] = pixels[o + 1] / 255
      chw[2 * plane + i] = pixels[o + 2] / 255
    }
  }

  const result = await io.run(chw, [1, 3, h, w])
  const [, , oh, ow] = result.dims
  const out = result.data

  // Adaptive normalization (see doc comment).
  const darks: number[] = []
  for (let i = 0; i < oh * ow; i++) {
    const d = 1 - out[i]
    if (d > DARKNESS_FLOOR) darks.push(d)
  }
  darks.sort((a, b) => a - b)
  const p95 = darks.length > 0 ? darks[Math.floor(darks.length * 0.95)] : 1
  const scale = 1 / Math.max(p95, P95_MIN)

  const alpha = new Uint8Array(width * height)
  for (let y = BORDER_PX; y < oh - BORDER_PX && y < height; y++) {
    for (let x = BORDER_PX; x < ow - BORDER_PX && x < width; x++) {
      const d = (1 - out[y * ow + x]) * scale
      const a = Math.max(0, Math.min(1, (d - INK_THRESHOLD) / INK_RAMP))
      alpha[y * width + x] = Math.round(a * 255)
    }
  }
  return alpha
}
