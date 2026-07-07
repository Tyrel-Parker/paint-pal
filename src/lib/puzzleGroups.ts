import type { Difficulty, Puzzle } from '../types/puzzle'

export interface PuzzleGroup {
  key: string
  name: string
  source: Puzzle['source']
  thumbnail: string
  outline: string
  outlineWidth: number
  outlineHeight: number
  variants: Partial<Record<Difficulty, Puzzle>>
}

const DIFFICULTY_SUFFIX = /-(easy|medium|hard)$/

/** Groups the flat puzzle list back into one entry per source image. */
export function groupPuzzlesByImage(puzzles: Puzzle[]): PuzzleGroup[] {
  const groups = new Map<string, PuzzleGroup>()

  for (const puzzle of puzzles) {
    const key = puzzle.id.replace(DIFFICULTY_SUFFIX, '')
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        name: puzzle.name,
        source: puzzle.source,
        thumbnail: puzzle.thumbnail,
        outline: puzzle.outline,
        outlineWidth: puzzle.outlineWidth,
        outlineHeight: puzzle.outlineHeight,
        variants: {},
      }
      groups.set(key, group)
    }
    group.variants[puzzle.difficulty] = puzzle
    if (puzzle.difficulty === 'medium') group.thumbnail = puzzle.thumbnail
  }

  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
}
