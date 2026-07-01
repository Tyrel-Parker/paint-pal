export type Difficulty = 'easy' | 'medium' | 'hard'

// easy: 6-8 colors, medium: 9-15, hard: 15-20
export const DIFFICULTY_COLOR_RANGE: Record<Difficulty, [number, number]> = {
  easy: [6, 8],
  medium: [9, 15],
  hard: [15, 20],
}

export interface PuzzleRegion {
  id: number
  colorNumber: number
  /** SVG path `d` attribute for this region's outline */
  path: string
  /** Centroid in image coordinates, used to place the number label */
  labelX: number
  labelY: number
}

/** Maps a region's color number to its original (or user-recolored) hex value */
export type Palette = Record<number, string>

export interface Puzzle {
  id: string
  name: string
  difficulty: Difficulty
  width: number
  height: number
  regions: PuzzleRegion[]
  palette: Palette
  source: 'builtin' | 'user'
  thumbnail: string
}

export type PaintMode = 'numbers' | 'free'

export interface Progress {
  /** Composite key: `${puzzleId}:${mode}` */
  key: string
  puzzleId: string
  mode: PaintMode
  /** region id -> hex color currently filled in */
  filledRegions: Record<number, string>
  /** palette as customized by the kid before/while playing, if changed from default */
  customPalette?: Palette
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
