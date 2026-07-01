export interface LabeledRegions {
  /** Per-pixel region id, row-major, 0-indexed. */
  labels: Uint32Array
  areaByRegion: number[]
  /** Palette index each region was labeled from. */
  colorIndexByRegion: number[]
}

/**
 * 4-connected flood fill over a quantized-color-index grid. Diagonally-touching
 * same-color pixels stay separate regions — that matches how a kid visually
 * parses "separate blobs" and avoids thin diagonal bridges.
 */
export function labelRegions(paletteIndex: Uint32Array, width: number, height: number): LabeledRegions {
  const size = width * height
  const labels = new Uint32Array(size).fill(0xffffffff)
  const areaByRegion: number[] = []
  const colorIndexByRegion: number[] = []
  const queue = new Int32Array(size)

  for (let start = 0; start < size; start++) {
    if (labels[start] !== 0xffffffff) continue

    const regionId = areaByRegion.length
    const color = paletteIndex[start]
    let queueHead = 0
    let queueTail = 0
    queue[queueTail++] = start
    labels[start] = regionId
    let area = 0

    while (queueHead < queueTail) {
      const pixel = queue[queueHead++]
      area++
      const x = pixel % width
      const y = (pixel - x) / width

      if (x > 0) tryVisit(pixel - 1)
      if (x < width - 1) tryVisit(pixel + 1)
      if (y > 0) tryVisit(pixel - width)
      if (y < height - 1) tryVisit(pixel + width)
    }

    areaByRegion.push(area)
    colorIndexByRegion.push(color)

    function tryVisit(neighbor: number) {
      if (labels[neighbor] === 0xffffffff && paletteIndex[neighbor] === color) {
        labels[neighbor] = regionId
        queue[queueTail++] = neighbor
      }
    }
  }

  return { labels, areaByRegion, colorIndexByRegion }
}

/** Shared-border pixel counts between adjacent regions, as regionId -> neighborId -> count. */
export function computeAdjacency(labels: Uint32Array, width: number, height: number): Map<number, Map<number, number>> {
  const adjacency = new Map<number, Map<number, number>>()

  const addEdge = (a: number, b: number) => {
    if (a === b) return
    for (const [x, y] of [[a, b], [b, a]] as const) {
      let neighbors = adjacency.get(x)
      if (!neighbors) {
        neighbors = new Map()
        adjacency.set(x, neighbors)
      }
      neighbors.set(y, (neighbors.get(y) ?? 0) + 1)
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (x < width - 1) addEdge(labels[i], labels[i + 1])
      if (y < height - 1) addEdge(labels[i], labels[i + width])
    }
  }

  return adjacency
}
