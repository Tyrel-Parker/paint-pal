import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Puzzle, Progress, FinishedWork } from '../types/puzzle'

interface PaintPalDB extends DBSchema {
  userPuzzles: { key: string; value: Puzzle }
  progress: { key: string; value: Progress }
  finished: { key: string; value: FinishedWork }
}

let dbPromise: Promise<IDBPDatabase<PaintPalDB>> | undefined

function getDB() {
  dbPromise ??= openDB<PaintPalDB>('paint-pal', 1, {
    upgrade(db) {
      db.createObjectStore('userPuzzles', { keyPath: 'id' })
      db.createObjectStore('progress', { keyPath: 'key' })
      db.createObjectStore('finished', { keyPath: 'key' })
    },
  })
  return dbPromise
}

export async function saveUserPuzzle(puzzle: Puzzle) {
  const db = await getDB()
  await db.put('userPuzzles', puzzle)
}

export async function getUserPuzzles(): Promise<Puzzle[]> {
  const db = await getDB()
  return db.getAll('userPuzzles')
}

export async function deleteUserPuzzle(id: string) {
  const db = await getDB()
  await db.delete('userPuzzles', id)
}

export async function saveProgress(progress: Progress) {
  const db = await getDB()
  await db.put('progress', progress)
}

export async function getProgress(puzzleId: string, mode: Progress['mode']): Promise<Progress | undefined> {
  const db = await getDB()
  return db.get('progress', `${puzzleId}:${mode}`)
}

export async function deleteProgress(puzzleId: string, mode: Progress['mode']) {
  const db = await getDB()
  await db.delete('progress', `${puzzleId}:${mode}`)
}

export async function saveFinishedWork(work: FinishedWork) {
  const db = await getDB()
  await db.put('finished', work)
}

export async function getFinishedWorks(): Promise<FinishedWork[]> {
  const db = await getDB()
  return db.getAll('finished')
}
