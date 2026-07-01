import type { Puzzle } from '../types/puzzle'

/** Puzzles generated at build time by scripts/preprocess.mjs from source-images/ */
export async function fetchBuiltinPuzzles(): Promise<Puzzle[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}puzzles/manifest.json`)
  if (!res.ok) return []
  return res.json()
}
