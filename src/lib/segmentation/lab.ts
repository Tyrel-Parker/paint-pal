/**
 * sRGB <-> CIELAB (D65). All pipeline color math happens in Lab so that
 * "similar" means perceptually similar — RGB distance treats a shadow on fur
 * as a bigger change than green-vs-brown, which is exactly backwards for
 * coloring-book segmentation.
 */

const Xn = 0.95047
const Yn = 1.0
const Zn = 1.08883

const LINEAR_LUT = new Float32Array(256)
for (let i = 0; i < 256; i++) {
  const c = i / 255
  LINEAR_LUT[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function fwd(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116
}

/** RGBA bytes -> packed [L,a,b, L,a,b, ...] Float32Array (alpha ignored). */
export function rgbaToLab(pixels: Uint8ClampedArray, size: number): Float32Array {
  const lab = new Float32Array(size * 3)
  for (let i = 0; i < size; i++) {
    const o = i * 4
    const r = LINEAR_LUT[pixels[o]]
    const g = LINEAR_LUT[pixels[o + 1]]
    const b = LINEAR_LUT[pixels[o + 2]]

    const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / Xn
    const y = (0.2126729 * r + 0.7151522 * g + 0.072175 * b) / Yn
    const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / Zn

    const fx = fwd(x)
    const fy = fwd(y)
    const fz = fwd(z)

    const j = i * 3
    lab[j] = 116 * fy - 16
    lab[j + 1] = 500 * (fx - fy)
    lab[j + 2] = 200 * (fy - fz)
  }
  return lab
}

function inv(t: number): number {
  const t3 = t * t * t
  return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787
}

function linearToSrgbByte(c: number): number {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, Math.round(v * 255)))
}

export function labToRgb(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116
  const fx = fy + a / 500
  const fz = fy - b / 200

  const x = inv(fx) * Xn
  const y = inv(fy) * Yn
  const z = inv(fz) * Zn

  const rl = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z
  const gl = -0.969266 * x + 1.8760108 * y + 0.041556 * z
  const bl = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z

  return [linearToSrgbByte(rl), linearToSrgbByte(gl), linearToSrgbByte(bl)]
}

/**
 * Lab -> hex, with optional chroma boost (>1 nudges a/b outward) so the final
 * palette reads a touch more vivid than the smoothing-flattened photo.
 */
export function labToHex(L: number, a: number, b: number, chromaBoost = 1): string {
  const [r, g, bb] = labToRgb(L, a * chromaBoost, b * chromaBoost)
  const channel = (n: number) => n.toString(16).padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(bb)}`
}

/** #rrggbb -> [L, a, b]. */
export function hexToLab(hex: string): [number, number, number] {
  const pixel = new Uint8ClampedArray([
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
    255,
  ])
  const lab = rgbaToLab(pixel, 1)
  return [lab[0], lab[1], lab[2]]
}

/** Squared Lab distance between palette entries i and j of a packed centroid array. */
export function labDistSq(labArr: Float32Array, i: number, j: number): number {
  const a = i * 3
  const b = j * 3
  const dL = labArr[a] - labArr[b]
  const da = labArr[a + 1] - labArr[b + 1]
  const db = labArr[a + 2] - labArr[b + 2]
  return dL * dL + da * da + db * db
}
