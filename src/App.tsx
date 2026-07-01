import { useEffect, useState } from 'react'
import { fetchBuiltinPuzzles } from './lib/manifest'
import { getUserPuzzles } from './lib/storage'
import type { PaintMode, Puzzle } from './types/puzzle'
import Gallery from './components/Gallery'
import PuzzleScreen from './components/PuzzleScreen'
import FinishedGallery from './components/FinishedGallery'
import './App.css'

type Screen = { screen: 'gallery' } | { screen: 'puzzle'; puzzleId: string; mode: PaintMode } | { screen: 'finished' }

function App() {
  const [puzzles, setPuzzles] = useState<Puzzle[]>([])
  const [loading, setLoading] = useState(true)
  const [screen, setScreen] = useState<Screen>({ screen: 'gallery' })

  useEffect(() => {
    Promise.all([fetchBuiltinPuzzles(), getUserPuzzles()]).then(([builtin, user]) => {
      setPuzzles([...builtin, ...user])
      setLoading(false)
    })
  }, [])

  if (screen.screen === 'puzzle') {
    const puzzle = puzzles.find((p) => p.id === screen.puzzleId)
    if (!puzzle) {
      return <Gallery puzzles={puzzles} loading={loading} onPlay={(puzzleId, mode) => setScreen({ screen: 'puzzle', puzzleId, mode })} onShowFinished={() => setScreen({ screen: 'finished' })} />
    }
    return (
      <PuzzleScreen
        puzzle={puzzle}
        mode={screen.mode}
        onExit={() => setScreen({ screen: 'gallery' })}
        onFinished={() => setScreen({ screen: 'finished' })}
      />
    )
  }

  if (screen.screen === 'finished') {
    return <FinishedGallery onExit={() => setScreen({ screen: 'gallery' })} />
  }

  return (
    <Gallery
      puzzles={puzzles}
      loading={loading}
      onPlay={(puzzleId, mode) => setScreen({ screen: 'puzzle', puzzleId, mode })}
      onShowFinished={() => setScreen({ screen: 'finished' })}
    />
  )
}

export default App
