import type { LabelMapRLE, Palette, PuzzleRegion } from '../../types/puzzle'

export interface SegmentationOptions {
  /** Foreground threshold when `subjectMask` is given, otherwise the single global threshold. */
  minRegionAreaPx?: number
  /** Background threshold, only used when `subjectMask` is also given. */
  backgroundMinRegionAreaPx?: number
  /** Per-pixel foreground confidence (0-255), same width*height layout as the pixel buffer. */
  subjectMask?: Uint8Array
}

export interface SegmentationResult {
  width: number
  height: number
  palette: Palette
  regions: PuzzleRegion[]
  labelMap: LabelMapRLE
}
