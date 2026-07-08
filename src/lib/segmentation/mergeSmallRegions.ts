import { labDistSq } from './lab'

export interface MergeResult {
  /** Maps every original region id to its final (post-merge) region id. */
  finalRegionId: (originalId: number) => number
  areaByFinalRegion: Map<number, number>
  colorIndexByFinalRegion: Map<number, number>
}

export interface MergeSmallRegionsOptions {
  /**
   * When set (with `regionForegroundConfidence`), `minAreaPx` becomes the
   * foreground threshold and this becomes the background one — each
   * region's effective minimum area is interpolated between them by its
   * own confidence, so background regions merge away much more
   * aggressively than foreground ones without losing subject detail.
   */
  backgroundMinAreaPx?: number
  /** 0-1 per *original* (pre-merge) region id. Roots are always original ids (see merge()), so this stays valid throughout merging without needing to be tracked/updated. */
  regionForegroundConfidence?: Map<number, number>
  /**
   * Packed [L,a,b,...] palette centroids, indexed by each region's colorIndex.
   * When present, a too-small region merges into the neighbor with the
   * *nearest palette color* (border length only breaks near-ties), so merges
   * are visually invisible instead of snapping a dark shape into a light one
   * just because they share a long border.
   */
  paletteLab?: Float32Array
  /**
   * When set (needs `paletteLab` + `regionForegroundConfidence`): after
   * size-based merging, adjacent *background* regions whose palette colors
   * are within this ΔE also merge, regardless of size. This collapses
   * "isophote banding" — nested near-identical bands that quantization
   * carves out of smooth gradients (snow shadows, bokeh, sky) — which
   * survive size thresholds because each band is individually large.
   */
  backgroundSimilarityDeltaE?: number
  /**
   * Palette indices below this are foreground colors (split-palette mode).
   * Small regions then strongly prefer merging into a neighbor on their own
   * side of the silhouette; crossing it is a last resort for mask specks.
   */
  foregroundColorCount?: number
}

/** ΔE band within which two candidate colors count as "equally close" and border length decides. */
const NEAR_TIE_DELTA_E = 2.5

/**
 * Merges regions smaller than `minAreaPx` into a neighbor, via union-find.
 * With `paletteLab` set, the neighbor with the perceptually closest color
 * wins (longest shared border breaks near-ties); otherwise falls back to
 * longest-border. A region's neighbors are always a different color by
 * construction (same-color adjacent pixels were already joined during
 * connected-component labeling), so merging a tiny region necessarily
 * reassigns it to a neighboring color — that's the intended coloring-book
 * simplification.
 */
export function mergeSmallRegions(
  areaByRegion: number[],
  colorIndexByRegion: number[],
  adjacency: Map<number, Map<number, number>>,
  minAreaPx: number,
  options: MergeSmallRegionsOptions = {},
): MergeResult {
  const {
    backgroundMinAreaPx,
    regionForegroundConfidence,
    paletteLab,
    backgroundSimilarityDeltaE,
    foregroundColorCount,
  } = options
  const regionCount = areaByRegion.length
  const parent = Int32Array.from({ length: regionCount }, (_, i) => i)
  const area = [...areaByRegion]
  const colorIndex = [...colorIndexByRegion]

  function effectiveMinArea(regionId: number): number {
    if (backgroundMinAreaPx === undefined || !regionForegroundConfidence) return minAreaPx
    const confidence = regionForegroundConfidence.get(regionId) ?? 0
    return minAreaPx + (1 - confidence) * (backgroundMinAreaPx - minAreaPx)
  }

  function find(id: number): number {
    let root = id
    while (parent[root] !== root) root = parent[root]
    while (parent[id] !== root) {
      const next = parent[id]
      parent[id] = root
      id = next
    }
    return root
  }

  function bestNeighbor(root: number): number | undefined {
    const neighbors = adjacency.get(root)
    if (!neighbors || neighbors.size === 0) return undefined
    let best: number | undefined
    // Candidates are bucketed by color distance (NEAR_TIE_DELTA_E-wide bands);
    // the lowest bucket wins, longest shared border decides within a bucket.
    let bestBucket = Infinity
    let bestScore = -1
    for (const [neighbor, sharedBorder] of neighbors) {
      const neighborRoot = find(neighbor)
      if (neighborRoot === root) continue
      let bucket = paletteLab
        ? Math.floor(Math.sqrt(labDistSq(paletteLab, colorIndex[root], colorIndex[neighborRoot])) / NEAR_TIE_DELTA_E)
        : 0
      if (
        foregroundColorCount !== undefined &&
        colorIndex[root] < foregroundColorCount !== colorIndex[neighborRoot] < foregroundColorCount
      ) {
        bucket += 1000 // crossing the silhouette: allowed, but only when nothing else will take it
      }
      const score = sharedBorder * 1e6 + area[neighborRoot] * 10 - neighborRoot
      if (bucket < bestBucket || (bucket === bestBucket && score > bestScore)) {
        bestBucket = bucket
        bestScore = score
        best = neighborRoot
      }
    }
    return best
  }

  function merge(smallRoot: number, intoRoot: number) {
    parent[smallRoot] = intoRoot
    area[intoRoot] += area[smallRoot]

    const smallNeighbors = adjacency.get(smallRoot)
    const intoNeighbors = adjacency.get(intoRoot) ?? new Map<number, number>()
    adjacency.set(intoRoot, intoNeighbors)

    if (smallNeighbors) {
      for (const [neighbor, count] of smallNeighbors) {
        const neighborRoot = find(neighbor)
        if (neighborRoot === intoRoot) continue
        intoNeighbors.set(neighborRoot, (intoNeighbors.get(neighborRoot) ?? 0) + count)
        const reverse = adjacency.get(neighborRoot)
        if (reverse) {
          reverse.delete(smallRoot)
          reverse.set(intoRoot, (reverse.get(intoRoot) ?? 0) + count)
        }
      }
    }
    adjacency.delete(smallRoot)
  }

  const pending = new Set<number>()
  for (let id = 0; id < regionCount; id++) {
    if (area[id] < effectiveMinArea(id)) pending.add(id)
  }

  while (pending.size > 0) {
    const [id] = pending
    pending.delete(id)
    const root = find(id)
    if (root !== id || area[root] >= effectiveMinArea(root)) continue

    const neighbor = bestNeighbor(root)
    if (neighbor === undefined) continue // whole image is one region; nothing to merge into

    merge(root, neighbor)
    if (area[neighbor] < effectiveMinArea(neighbor)) pending.add(neighbor)
  }

  // Background band collapse (see backgroundSimilarityDeltaE doc). Confidence
  // is read off original root ids — good enough, since background roots stay
  // background as they absorb other background roots.
  if (backgroundSimilarityDeltaE && paletteLab && regionForegroundConfidence) {
    const thresholdSq = backgroundSimilarityDeltaE * backgroundSimilarityDeltaE
    const isBackground = (root: number) => (regionForegroundConfidence.get(root) ?? 0) < 0.5

    let changed = true
    while (changed) {
      changed = false
      for (const root of [...adjacency.keys()]) {
        if (find(root) !== root || !isBackground(root)) continue
        const neighbors = adjacency.get(root)
        if (!neighbors) continue
        for (const neighbor of [...neighbors.keys()]) {
          const neighborRoot = find(neighbor)
          if (neighborRoot === root || !isBackground(neighborRoot)) continue
          if (labDistSq(paletteLab, colorIndex[root], colorIndex[neighborRoot]) >= thresholdSq) continue
          // Merge the smaller into the larger so the surviving color is the dominant one.
          if (area[root] >= area[neighborRoot]) {
            merge(neighborRoot, root)
          } else {
            merge(root, neighborRoot)
          }
          changed = true
          break
        }
      }
    }
  }

  const areaByFinalRegion = new Map<number, number>()
  const colorIndexByFinalRegion = new Map<number, number>()
  for (let id = 0; id < regionCount; id++) {
    const root = find(id)
    if (!areaByFinalRegion.has(root)) {
      areaByFinalRegion.set(root, area[root])
      colorIndexByFinalRegion.set(root, colorIndex[root])
    }
  }

  return { finalRegionId: find, areaByFinalRegion, colorIndexByFinalRegion }
}
