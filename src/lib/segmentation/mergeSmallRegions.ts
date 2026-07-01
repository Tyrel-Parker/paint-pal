export interface MergeResult {
  /** Maps every original region id to its final (post-merge) region id. */
  finalRegionId: (originalId: number) => number
  areaByFinalRegion: Map<number, number>
  colorIndexByFinalRegion: Map<number, number>
}

/**
 * Merges regions smaller than `minAreaPx` into whichever neighbor shares the
 * longest border, via union-find. A region's neighbors are always a
 * different color by construction (same-color adjacent pixels were already
 * joined during connected-component labeling), so merging a tiny region
 * necessarily reassigns it to a neighboring color — that's the intended
 * coloring-book simplification.
 */
export function mergeSmallRegions(
  areaByRegion: number[],
  colorIndexByRegion: number[],
  adjacency: Map<number, Map<number, number>>,
  minAreaPx: number,
): MergeResult {
  const regionCount = areaByRegion.length
  const parent = Int32Array.from({ length: regionCount }, (_, i) => i)
  const area = [...areaByRegion]
  const colorIndex = [...colorIndexByRegion]

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
    let bestScore = -1
    for (const [neighbor, sharedBorder] of neighbors) {
      const neighborRoot = find(neighbor)
      if (neighborRoot === root) continue
      const score = sharedBorder * 1e6 + area[neighborRoot] * 10 - neighborRoot
      if (score > bestScore) {
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
    if (area[id] < minAreaPx) pending.add(id)
  }

  while (pending.size > 0) {
    const [id] = pending
    pending.delete(id)
    const root = find(id)
    if (root !== id || area[root] >= minAreaPx) continue

    const neighbor = bestNeighbor(root)
    if (neighbor === undefined) continue // whole image is one region; nothing to merge into

    merge(root, neighbor)
    if (area[neighbor] < minAreaPx) pending.add(neighbor)
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
