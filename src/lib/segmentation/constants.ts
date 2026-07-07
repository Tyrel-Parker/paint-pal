import type { Difficulty } from '../../types/puzzle'
import type { SmoothingParams } from './bilateral'

export interface RegionAreaThreshold {
  /** Fraction of total image area. */
  fraction: number
  /** Absolute floor in pixels; the effective threshold is max(fraction * area, floorPx). */
  floorPx: number
}

export interface DifficultyParams {
  /** Longest edge of the working resolution used for both segmentation and display. */
  maxDimension: number
  /** Requested palette size (duplicate-merge may reduce it slightly). */
  colorCount: number
  /** Bilateral pre-smoothing strength; heavier = flatter, more poster-like regions. */
  smoothing: SmoothingParams
  /** Mode-filter radius applied to the palette-index map (passes fixed at 2). */
  modeFilterRadius: number
  /** Subject regions smaller than this merge away. */
  minRegionArea: RegionAreaThreshold
  /** Background regions merge much more aggressively so they stay simple. */
  backgroundMinRegionArea: RegionAreaThreshold
  /** Adjacent background regions closer than this ΔE merge regardless of size (kills gradient banding). */
  backgroundSimilarityDeltaE: number
}

/**
 * Difficulty scales four axes together: resolution, palette size, smoothing
 * strength (down — hard keeps more detail), and minimum region size (down —
 * hard allows smaller shapes). Values tuned visually against the 9 seed
 * photos via scripts/preview.ts; regenerate the contact sheets after touching
 * anything here.
 */
export const DIFFICULTY_PARAMS: Record<Difficulty, DifficultyParams> = {
  easy: {
    maxDimension: 640,
    colorCount: 8,
    smoothing: { iterations: 6, rangeSigma: 14 },
    modeFilterRadius: 4,
    minRegionArea: { fraction: 0.004, floorPx: 400 },
    backgroundMinRegionArea: { fraction: 0.012, floorPx: 3000 },
    backgroundSimilarityDeltaE: 14,
  },
  medium: {
    maxDimension: 1024,
    colorCount: 14,
    smoothing: { iterations: 5, rangeSigma: 11 },
    modeFilterRadius: 3,
    minRegionArea: { fraction: 0.0015, floorPx: 450 },
    backgroundMinRegionArea: { fraction: 0.008, floorPx: 4500 },
    backgroundSimilarityDeltaE: 9,
  },
  hard: {
    maxDimension: 1536,
    colorCount: 24,
    smoothing: { iterations: 4, rangeSigma: 8 },
    modeFilterRadius: 2,
    minRegionArea: { fraction: 0.0005, floorPx: 400 },
    backgroundMinRegionArea: { fraction: 0.005, floorPx: 6000 },
    backgroundSimilarityDeltaE: 7,
  },
}

/**
 * Fixed settings for the Free Paint coloring-book outline: a coarse
 * segmentation whose region boundaries *are* the line art. Fewer colors and
 * heavier smoothing than any puzzle tier, and a background threshold so
 * aggressive the background collapses to a handful of big simple shapes.
 */
export const OUTLINE_PARAMS: DifficultyParams = {
  maxDimension: 1024,
  colorCount: 10,
  smoothing: { iterations: 7, rangeSigma: 15 },
  modeFilterRadius: 4,
  minRegionArea: { fraction: 0.004, floorPx: 1500 },
  backgroundMinRegionArea: { fraction: 0.04, floorPx: 20000 },
  backgroundSimilarityDeltaE: 16,
}

export function effectiveMinArea(threshold: RegionAreaThreshold, width: number, height: number): number {
  return Math.max(width * height * threshold.fraction, threshold.floorPx)
}
