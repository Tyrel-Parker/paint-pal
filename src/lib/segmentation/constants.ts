import type { Difficulty } from '../../types/puzzle'

/** Longest edge of the working resolution used for both segmentation and display. */
export const MAX_DIMENSION = 1024

/** Requested at the top of each tier's range, since merging only ever reduces color count. */
export const TARGET_COLOR_COUNT: Record<Difficulty, number> = {
  easy: 8,
  medium: 15,
  hard: 20,
}

/** Regions smaller than this (fraction of image area, floored at a pixel minimum) get merged away. */
export const MERGE_THRESHOLD: Record<Difficulty, { fraction: number; floorPx: number }> = {
  easy: { fraction: 0.008, floorPx: 250 },
  medium: { fraction: 0.004, floorPx: 150 },
  hard: { fraction: 0.002, floorPx: 80 },
}
