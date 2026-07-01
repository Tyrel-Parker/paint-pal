import type { Difficulty } from '../../types/puzzle'

/** Longest edge of the working resolution used for both segmentation and display. */
export const MAX_DIMENSION: Record<Difficulty, number> = {
  easy: 640,
  medium: 1024,
  hard: 1536,
}

/** Requested at the top of each tier's range, since merging only ever reduces color count. */
export const TARGET_COLOR_COUNT: Record<Difficulty, number> = {
  easy: 9,
  medium: 18,
  hard: 28,
}

/**
 * Regions smaller than this get merged away. Tuned empirically per tier against all 9 seed
 * photos (see scripts/tune-test.ts) rather than derived analytically — region count is highly
 * nonlinear near small thresholds (dropping `hard`'s floor from 450 to 150 previously exploded
 * one photo from ~120 regions to ~6000). `fraction` matters here: it's what makes the threshold
 * scale down relative to each tier's own MAX_DIMENSION, so `hard`'s higher resolution actually
 * yields more geometric detail instead of just more raw pixels at the same relative chunkiness.
 */
export const MERGE_THRESHOLD: Record<Difficulty, { fraction: number; floorPx: number }> = {
  easy: { fraction: 0.005, floorPx: 500 },
  medium: { fraction: 0.002, floorPx: 550 },
  hard: { fraction: 0.0006, floorPx: 450 },
}
