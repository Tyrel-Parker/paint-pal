/**
 * Weighted k-means palette selection in Lab space, replacing image-q's Wu
 * quantizer. Two things Wu couldn't do that matter here: distances are
 * perceptual (Lab, not RGB), and subject pixels carry extra weight so palette
 * diversity goes to the subject instead of acres of sky/grass.
 */

import { labDistSq } from './lab'

const MAX_SAMPLES = 80_000
const MAX_ITERATIONS = 20
const CONVERGED_SHIFT_SQ = 0.05 * 0.05
/** Centroids closer than this ΔE get merged — two near-identical palette entries only confuse kids. */
const DUPLICATE_DELTA_E = 3

/** Deterministic PRNG so preprocess output is reproducible across runs. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * @param lab packed [L,a,b,...] image
 * @param size pixel count
 * @param k requested palette size (result may be smaller after duplicate merge)
 * @param weights optional per-pixel weight (e.g. boosted on the subject)
 * @returns packed [L,a,b,...] centroids
 */
export function buildPaletteKMeans(
  lab: Float32Array,
  size: number,
  k: number,
  weights?: Float32Array,
  seed = 0x9e3779b9,
): Float32Array {
  const stride = Math.max(1, Math.floor(size / MAX_SAMPLES))
  const sampleCount = Math.floor((size - 1) / stride) + 1

  const samples = new Float32Array(sampleCount * 3)
  const sampleWeights = new Float32Array(sampleCount)
  for (let s = 0, i = 0; s < sampleCount; s++, i += stride) {
    samples[s * 3] = lab[i * 3]
    samples[s * 3 + 1] = lab[i * 3 + 1]
    samples[s * 3 + 2] = lab[i * 3 + 2]
    sampleWeights[s] = weights ? weights[i] : 1
  }

  const rand = mulberry32(seed)
  const kEff = Math.min(k, sampleCount)
  let centroids = kmeansPlusPlusInit(samples, sampleWeights, sampleCount, kEff, rand)

  const assignment = new Uint32Array(sampleCount)
  const sums = new Float64Array(kEff * 3)
  const counts = new Float64Array(kEff)

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    sums.fill(0)
    counts.fill(0)

    for (let s = 0; s < sampleCount; s++) {
      const o = s * 3
      let best = 0
      let bestDist = Infinity
      for (let c = 0; c < kEff; c++) {
        const co = c * 3
        const dL = samples[o] - centroids[co]
        const da = samples[o + 1] - centroids[co + 1]
        const db = samples[o + 2] - centroids[co + 2]
        const d = dL * dL + da * da + db * db
        if (d < bestDist) {
          bestDist = d
          best = c
        }
      }
      assignment[s] = best
      const w = sampleWeights[s]
      sums[best * 3] += samples[o] * w
      sums[best * 3 + 1] += samples[o + 1] * w
      sums[best * 3 + 2] += samples[o + 2] * w
      counts[best] += w
    }

    let maxShiftSq = 0
    const next = new Float32Array(centroids)
    for (let c = 0; c < kEff; c++) {
      if (counts[c] === 0) continue // empty cluster keeps its position
      const co = c * 3
      const L = sums[co] / counts[c]
      const a = sums[co + 1] / counts[c]
      const b = sums[co + 2] / counts[c]
      const dL = L - centroids[co]
      const da = a - centroids[co + 1]
      const db = b - centroids[co + 2]
      maxShiftSq = Math.max(maxShiftSq, dL * dL + da * da + db * db)
      next[co] = L
      next[co + 1] = a
      next[co + 2] = b
    }
    centroids = next
    if (maxShiftSq < CONVERGED_SHIFT_SQ) break
  }

  return mergeDuplicateCentroids(centroids, counts)
}

function kmeansPlusPlusInit(
  samples: Float32Array,
  weights: Float32Array,
  sampleCount: number,
  k: number,
  rand: () => number,
): Float32Array {
  const centroids = new Float32Array(k * 3)
  const distSq = new Float32Array(sampleCount).fill(Infinity)

  // First centroid: weighted random sample.
  let totalWeight = 0
  for (let s = 0; s < sampleCount; s++) totalWeight += weights[s]
  let pick = rand() * totalWeight
  let first = 0
  for (let s = 0; s < sampleCount; s++) {
    pick -= weights[s]
    if (pick <= 0) {
      first = s
      break
    }
  }
  centroids.set(samples.subarray(first * 3, first * 3 + 3), 0)

  for (let c = 1; c < k; c++) {
    const prev = (c - 1) * 3
    let total = 0
    for (let s = 0; s < sampleCount; s++) {
      const o = s * 3
      const dL = samples[o] - centroids[prev]
      const da = samples[o + 1] - centroids[prev + 1]
      const db = samples[o + 2] - centroids[prev + 2]
      const d = dL * dL + da * da + db * db
      if (d < distSq[s]) distSq[s] = d
      total += distSq[s] * weights[s]
    }

    if (total === 0) {
      // All remaining samples coincide with existing centroids.
      centroids.set(centroids.subarray(0, 3), c * 3)
      continue
    }

    let target = rand() * total
    let chosen = sampleCount - 1
    for (let s = 0; s < sampleCount; s++) {
      target -= distSq[s] * weights[s]
      if (target <= 0) {
        chosen = s
        break
      }
    }
    centroids.set(samples.subarray(chosen * 3, chosen * 3 + 3), c * 3)
  }

  return centroids
}

function mergeDuplicateCentroids(centroids: Float32Array, counts: Float64Array): Float32Array {
  const k = centroids.length / 3
  const keep: number[] = []
  const thresholdSq = DUPLICATE_DELTA_E * DUPLICATE_DELTA_E

  for (let c = 0; c < k; c++) {
    if (counts[c] === 0) continue
    const duplicate = keep.some((existing) => labDistSq(centroids, c, existing) < thresholdSq)
    if (!duplicate) keep.push(c)
  }
  if (keep.length === 0) keep.push(0)

  const out = new Float32Array(keep.length * 3)
  keep.forEach((c, i) => out.set(centroids.subarray(c * 3, c * 3 + 3), i * 3))
  return out
}

/** Nearest-centroid assignment of every pixel. */
export function assignToPalette(lab: Float32Array, size: number, centroids: Float32Array): Uint32Array {
  const k = centroids.length / 3
  const out = new Uint32Array(size)
  for (let i = 0; i < size; i++) {
    const o = i * 3
    let best = 0
    let bestDist = Infinity
    for (let c = 0; c < k; c++) {
      const co = c * 3
      const dL = lab[o] - centroids[co]
      const da = lab[o + 1] - centroids[co + 1]
      const db = lab[o + 2] - centroids[co + 2]
      const d = dL * dL + da * da + db * db
      if (d < bestDist) {
        bestDist = d
        best = c
      }
    }
    out[i] = best
  }
  return out
}
