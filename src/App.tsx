import { useEffect, useState } from 'react'
import { fetchBuiltinPuzzles } from './lib/manifest'
import { getUserPuzzles } from './lib/storage'
import type { Puzzle } from './types/puzzle'
import './App.css'

function App() {
  const [puzzles, setPuzzles] = useState<Puzzle[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([fetchBuiltinPuzzles(), getUserPuzzles()]).then(([builtin, user]) => {
      setPuzzles([...builtin, ...user])
      setLoading(false)
    })
  }, [])

  return (
    <main className="gallery">
      <h1>PaintPal</h1>
      {loading ? (
        <p>Loading puzzles...</p>
      ) : puzzles.length === 0 ? (
        <p className="empty-state">
          No puzzles yet. Drop images into <code>source-images/</code> and run{' '}
          <code>npm run preprocess</code>, or add your own from the app once that's built.
        </p>
      ) : (
        <ul className="puzzle-grid">
          {puzzles.map((puzzle) => (
            <li key={puzzle.id}>
              <img src={puzzle.thumbnail} alt={puzzle.name} />
              <p>{puzzle.name}</p>
              <span className="difficulty-badge">{puzzle.difficulty}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

export default App
