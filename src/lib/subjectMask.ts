/** Nearest-neighbor resample of a single-channel confidence mask to a new resolution. */
export function resizeMaskNearest(
  mask: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
): Uint8Array {
  if (srcWidth === dstWidth && srcHeight === dstHeight) return mask

  const out = new Uint8Array(dstWidth * dstHeight)
  for (let y = 0; y < dstHeight; y++) {
    const sy = Math.min(srcHeight - 1, Math.floor((y / dstHeight) * srcHeight))
    for (let x = 0; x < dstWidth; x++) {
      const sx = Math.min(srcWidth - 1, Math.floor((x / dstWidth) * srcWidth))
      out[y * dstWidth + x] = mask[sy * srcWidth + sx]
    }
  }
  return out
}
