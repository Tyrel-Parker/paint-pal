import { buildPaletteSync, applyPaletteSync, utils } from 'image-q'

const { PointContainer } = utils

export interface QuantizeResult {
  /** Per-pixel index into `paletteColors`, row-major. */
  paletteIndex: Uint32Array
  /** Hex colors, index-aligned with `paletteIndex`. */
  paletteColors: string[]
}

function toHex(r: number, g: number, b: number): string {
  const channel = (n: number) => n.toString(16).padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

/**
 * Reduces the image to `colorCount` flat colors (Wu quantization for palette
 * selection, nearest-color assignment for pixels — no dithering, so the
 * result reads as clean coloring-book blocks rather than photographic noise).
 */
export function quantizeImage(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  colorCount: number,
): QuantizeResult {
  const source = PointContainer.fromUint8Array(pixels, width, height)
  const palette = buildPaletteSync([source], { paletteQuantization: 'wuquant', colors: colorCount })
  const applied = applyPaletteSync(source, palette, { imageQuantization: 'nearest' })

  const paletteColors: string[] = []
  const indexByColor = new Map<number, number>()
  for (const point of palette.getPointContainer().getPointArray()) {
    indexByColor.set(point.uint32, paletteColors.length)
    paletteColors.push(toHex(point.r, point.g, point.b))
  }

  const appliedPixels = applied.getPointArray()
  const paletteIndex = new Uint32Array(appliedPixels.length)
  for (let i = 0; i < appliedPixels.length; i++) {
    const index = indexByColor.get(appliedPixels[i].uint32)
    if (index === undefined) {
      throw new Error('Quantized pixel color not found in palette')
    }
    paletteIndex[i] = index
  }

  return { paletteIndex, paletteColors }
}
