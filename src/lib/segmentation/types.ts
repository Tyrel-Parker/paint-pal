import type { LabelMapRLE, Palette, PuzzleRegion } from '../../types/puzzle'

export interface SegmentationOptions {
  minRegionAreaPx?: number
}

export interface SegmentationResult {
  width: number
  height: number
  palette: Palette
  regions: PuzzleRegion[]
  labelMap: LabelMapRLE
}
