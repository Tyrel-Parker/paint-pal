import type { LabelMapRLE } from '../../types/puzzle'

/** Row-major RLE; runs may span row boundaries. */
export function encodeLabelMap(labels: Uint32Array, width: number, height: number): LabelMapRLE {
  const runs: number[] = []
  let prev = labels[0]
  let runLength = 1
  for (let i = 1; i < labels.length; i++) {
    const value = labels[i]
    if (value === prev) {
      runLength++
      continue
    }
    runs.push(prev, runLength)
    prev = value
    runLength = 1
  }
  runs.push(prev, runLength)
  return { width, height, runs }
}

export function decodeLabelMap(rle: LabelMapRLE): Uint32Array {
  const out = new Uint32Array(rle.width * rle.height)
  let index = 0
  for (let i = 0; i < rle.runs.length; i += 2) {
    const id = rle.runs[i]
    const length = rle.runs[i + 1]
    out.fill(id, index, index + length)
    index += length
  }
  return out
}
