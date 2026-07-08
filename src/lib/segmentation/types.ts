import type { LabelMapRLE, Palette, PuzzleRegion } from '../../types/puzzle'
import type { SmoothingParams } from './bilateral'

export interface SegmentationOptions {
  /** Foreground threshold when `subjectMask` is given, otherwise the single global threshold. */
  minRegionAreaPx?: number
  /** Background threshold, only used when `subjectMask` is also given. */
  backgroundMinRegionAreaPx?: number
  /** Per-pixel foreground confidence (0-255), same width*height layout as the pixel buffer. */
  subjectMask?: Uint8Array
  /** Adjacent background regions closer than this ΔE merge regardless of size (collapses gradient banding). */
  backgroundSimilarityDeltaE?: number
  /** Bilateral pre-smoothing strength; defaults to the medium tier's values. */
  smoothing?: SmoothingParams
  /** Precomputed smoothLab() output for these pixels; skips the internal smoothing pass when the caller already has one. */
  smoothedLab?: Float32Array
  /** Mode-filter radius for boundary cleanup (0 disables). */
  modeFilterRadius?: number
  /**
   * Desired final region-count range. When the first pass lands outside it,
   * the cheap stages rerun with adjusted color counts / merge thresholds
   * (the expensive bilateral smoothing is reused) — this is what keeps flat
   * hazy photos from collapsing to a handful of giant blobs, and busy ones
   * from exploding.
   */
  targetRegions?: { min: number; max: number }
}

export interface SegmentationResult {
  width: number
  height: number
  palette: Palette
  regions: PuzzleRegion[]
  labelMap: LabelMapRLE
}
