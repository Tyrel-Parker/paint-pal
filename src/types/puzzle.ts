export type Difficulty = 'easy' | 'medium' | 'hard'

export interface PuzzleRegion {
  id: number
  colorNumber: number
  /** Centroid in image coordinates, used to place the number label */
  labelX: number
  labelY: number
  areaPx: number
}

/** Maps a region's color number to its original (or user-recolored) hex value */
export type Palette = Record<number, string>

export interface LabelMapRLE {
  width: number
  height: number
  /** Row-major, alternating [regionId, runLength, ...]; runs may span rows. */
  runs: number[]
}

export interface Puzzle {
  id: string
  name: string
  difficulty: Difficulty
  width: number
  height: number
  /** Per-pixel region id, run-length encoded; decode with `decodeLabelMap`. */
  labelMap: LabelMapRLE
  regions: PuzzleRegion[]
  palette: Palette
  source: 'builtin' | 'user'
  thumbnail: string
  /** Whole-photo line-art outline (transparent background), shared across all difficulty variants of the same image. */
  outline: string
  outlineWidth: number
  outlineHeight: number
}

export type PaintMode = 'numbers' | 'free'

export interface Progress {
  /** Composite key: `${puzzleId}:${mode}` */
  key: string
  puzzleId: string
  mode: PaintMode
  /** region id -> hex color currently filled in (numbers mode only) */
  filledRegions: Record<number, string>
  /** palette as customized by the kid before/while playing, if changed from default (numbers mode only) */
  customPalette?: Palette
  /** freehand paint layer snapshot as a data URL (free mode only) */
  paintedImage?: string
  updatedAt: number
}

export interface FinishedWork {
  key: string
  puzzleId: string
  mode: PaintMode
  puzzleName: string
  completedAt: number
  /** rendered PNG snapshot of the finished piece, as a data URL */
  image: string
}
