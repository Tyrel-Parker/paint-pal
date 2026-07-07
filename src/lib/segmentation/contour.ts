/**
 * Contour tracing + polyline smoothing, so outline strokes look *drawn*
 * instead of being wobbly pixel-boundary traces. Douglas-Peucker turns
 * mode-filter wobble into straight runs (castle walls become walls);
 * Chaikin corner-cutting then rounds what remains into brush-like curves.
 */

import { labelRegions } from './connectedComponents'

/** Closed loop as flat [x0,y0, x1,y1, ...]. */
export type Loop = number[]

// Moore neighborhood, clockwise. Index by direction id.
const DIRS = [
  [-1, 0], // 0 W
  [-1, -1], // 1 NW
  [0, -1], // 2 N
  [1, -1], // 3 NE
  [1, 0], // 4 E
  [1, 1], // 5 SE
  [0, 1], // 6 S
  [-1, 1], // 7 SW
] as const

/**
 * Moore-neighbor trace of one component's outer boundary, starting from its
 * topmost-leftmost pixel. `labels`/`id` scope the trace to that component.
 */
function traceOuterBoundary(
  labels: Uint32Array,
  width: number,
  height: number,
  id: number,
  startX: number,
  startY: number,
): Loop {
  const inside = (x: number, y: number) =>
    x >= 0 && x < width && y >= 0 && y < height && labels[y * width + x] === id

  const loop: Loop = [startX, startY]
  let cx = startX
  let cy = startY
  // Entered the topmost-leftmost pixel "from the west".
  let backtrackDir = 0 // direction from current pixel toward the last empty neighbor
  const maxSteps = width * height * 4

  for (let step = 0; step < maxSteps; step++) {
    let found = false
    // Scan clockwise starting just after the backtrack direction.
    for (let k = 1; k <= 8; k++) {
      const d = (backtrackDir + k) % 8
      const nx = cx + DIRS[d][0]
      const ny = cy + DIRS[d][1]
      if (inside(nx, ny)) {
        // New backtrack: the neighbor scanned just before this one (empty),
        // expressed as a direction from the *new* current pixel.
        const prevD = (d + 7) % 8
        const bx = cx + DIRS[prevD][0]
        const by = cy + DIRS[prevD][1]
        cx = nx
        cy = ny
        backtrackDir = directionOf(bx - cx, by - cy)
        found = true
        break
      }
    }
    if (!found) return loop // isolated pixel

    if (cx === startX && cy === startY) return loop
    loop.push(cx, cy)
  }
  return loop
}

function directionOf(dx: number, dy: number): number {
  for (let d = 0; d < 8; d++) {
    if (DIRS[d][0] === Math.sign(dx) && DIRS[d][1] === Math.sign(dy)) return d
  }
  return 0
}

/**
 * All contours of a binary mask: one outer loop per 1-component, plus one
 * loop per enclosed hole (0-component not touching the image border).
 * Components smaller than `minArea` are skipped as specks.
 */
export function traceContours(mask: Uint8Array, width: number, height: number, minArea: number): Loop[] {
  const asIndex = new Uint32Array(mask) // labelRegions labels 0- and 1-areas alike
  const { labels, areaByRegion, colorIndexByRegion } = labelRegions(asIndex, width, height)

  const touchesBorder = new Uint8Array(areaByRegion.length)
  for (let x = 0; x < width; x++) {
    touchesBorder[labels[x]] = 1
    touchesBorder[labels[(height - 1) * width + x]] = 1
  }
  for (let y = 0; y < height; y++) {
    touchesBorder[labels[y * width]] = 1
    touchesBorder[labels[y * width + width - 1]] = 1
  }

  // Topmost-leftmost pixel of each region = first appearance in raster order.
  const startOf = new Int32Array(areaByRegion.length).fill(-1)
  for (let i = 0; i < labels.length; i++) {
    if (startOf[labels[i]] === -1) startOf[labels[i]] = i
  }

  const loops: Loop[] = []
  for (let id = 0; id < areaByRegion.length; id++) {
    if (areaByRegion[id] < minArea) continue
    const isForeground = colorIndexByRegion[id] === 1
    const isHole = colorIndexByRegion[id] === 0 && !touchesBorder[id]
    if (!isForeground && !isHole) continue
    const start = startOf[id]
    loops.push(traceOuterBoundary(labels, width, height, id, start % width, Math.floor(start / width)))
  }
  return loops
}

/** Douglas-Peucker on a closed loop (split at the two farthest-apart anchor points). */
export function simplifyLoop(loop: Loop, epsilon: number): Loop {
  const n = loop.length / 2
  if (n <= 4) return loop

  // Anchor at index 0 and the point farthest from it, then simplify each arc.
  let far = 0
  let farDist = -1
  for (let i = 0; i < n; i++) {
    const dx = loop[i * 2] - loop[0]
    const dy = loop[i * 2 + 1] - loop[1]
    const d = dx * dx + dy * dy
    if (d > farDist) {
      farDist = d
      far = i
    }
  }
  if (far === 0) return loop

  const keep = new Uint8Array(n)
  keep[0] = 1
  keep[far] = 1
  dpMark(loop, 0, far, epsilon, keep)
  dpMarkWrapped(loop, far, n, epsilon, keep)

  const out: Loop = []
  for (let i = 0; i < n; i++) {
    if (keep[i]) out.push(loop[i * 2], loop[i * 2 + 1])
  }
  return out
}

function perpDistSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax
  const aby = by - ay
  const lenSq = abx * abx + aby * aby
  if (lenSq === 0) {
    const dx = px - ax
    const dy = py - ay
    return dx * dx + dy * dy
  }
  const cross = (px - ax) * aby - (py - ay) * abx
  return (cross * cross) / lenSq
}

function dpMark(loop: Loop, from: number, to: number, epsilon: number, keep: Uint8Array) {
  if (to - from < 2) return
  const ax = loop[from * 2]
  const ay = loop[from * 2 + 1]
  const bx = loop[to * 2]
  const by = loop[to * 2 + 1]
  let worst = -1
  let worstDist = epsilon * epsilon
  for (let i = from + 1; i < to; i++) {
    const d = perpDistSq(loop[i * 2], loop[i * 2 + 1], ax, ay, bx, by)
    if (d > worstDist) {
      worstDist = d
      worst = i
    }
  }
  if (worst === -1) return
  keep[worst] = 1
  dpMark(loop, from, worst, epsilon, keep)
  dpMark(loop, worst, to, epsilon, keep)
}

/** DP over the wrap-around arc from index `from` back to index 0 (via the end). */
function dpMarkWrapped(loop: Loop, from: number, n: number, epsilon: number, keep: Uint8Array) {
  // Unwrap into a temp open polyline [from..n-1, 0].
  const m = n - from + 1
  if (m < 3) return
  const tmp: Loop = []
  const indexMap: number[] = []
  for (let i = from; i < n; i++) {
    tmp.push(loop[i * 2], loop[i * 2 + 1])
    indexMap.push(i)
  }
  tmp.push(loop[0], loop[1])
  indexMap.push(0)
  const tmpKeep = new Uint8Array(m)
  tmpKeep[0] = 1
  tmpKeep[m - 1] = 1
  dpMark(tmp, 0, m - 1, epsilon, tmpKeep)
  for (let i = 1; i < m - 1; i++) {
    if (tmpKeep[i]) keep[indexMap[i]] = 1
  }
}

/**
 * Chaikin corner cutting (closed), `rounds` iterations — but vertices that
 * turn harder than `cornerAngleDeg` are kept exactly, so castle spires and
 * ear tips stay pointy while gentle wobble gets smoothed.
 */
export function chaikinLoop(loop: Loop, rounds: number, cornerAngleDeg = 60): Loop {
  const cornerCos = Math.cos((cornerAngleDeg * Math.PI) / 180)
  let current = loop
  for (let r = 0; r < rounds; r++) {
    const n = current.length / 2
    if (n < 3) return current
    const next: Loop = []
    for (let i = 0; i < n; i++) {
      const prev = (i + n - 1) % n
      const after = (i + 1) % n
      const px = current[prev * 2]
      const py = current[prev * 2 + 1]
      const cx = current[i * 2]
      const cy = current[i * 2 + 1]
      const nx = current[after * 2]
      const ny = current[after * 2 + 1]

      const v1x = cx - px
      const v1y = cy - py
      const v2x = nx - cx
      const v2y = ny - cy
      const lens = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y)
      const cos = lens > 0 ? (v1x * v2x + v1y * v2y) / lens : 1

      if (cos < cornerCos) {
        next.push(cx, cy) // sharp corner: keep the point
      } else {
        next.push(cx + 0.25 * (px - cx), cy + 0.25 * (py - cy), cx + 0.25 * (nx - cx), cy + 0.25 * (ny - cy))
      }
    }
    current = next
  }
  return current
}

/** Stamp a round brush along the closed polyline into `target` (0/1 ink mask). */
export function strokeLoop(target: Uint8Array, width: number, height: number, loop: Loop, radius: number) {
  const offsets: number[] = []
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= radius * radius) offsets.push(dx, dy)
    }
  }
  const stamp = (x: number, y: number) => {
    const cx = Math.round(x)
    const cy = Math.round(y)
    for (let k = 0; k < offsets.length; k += 2) {
      const nx = cx + offsets[k]
      const ny = cy + offsets[k + 1]
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) target[ny * width + nx] = 1
    }
  }

  const n = loop.length / 2
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const ax = loop[i * 2]
    const ay = loop[i * 2 + 1]
    const bx = loop[j * 2]
    const by = loop[j * 2 + 1]
    const len = Math.hypot(bx - ax, by - ay)
    const steps = Math.max(1, Math.ceil(len))
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      stamp(ax + (bx - ax) * t, ay + (by - ay) * t)
    }
  }
}
