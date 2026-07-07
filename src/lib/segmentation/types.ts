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
  /** Mode-filter radius for boundary cleanup (0 disables). */
  modeFilterRadius?: number
  /** Extra k-means weight multiplier at full foreground confidence (1 = no boost). */
  subjectWeight?: number
}

export interface SegmentationResult {
  width: number
  height: number
  palette: Palette
  regions: PuzzleRegion[]
  labelMap: LabelMapRLE
}
