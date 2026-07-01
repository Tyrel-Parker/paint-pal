import { useEffect, useMemo, useState } from 'react'
import { fetchBuiltinPuzzles } from './lib/manifest'
import { getUserPuzzles } from './lib/storage'
import { groupPuzzlesByImage } from './lib/puzzleGroups'
import type { PaintMode, Puzzle } from './types/puzzle'
import Gallery from './components/Gallery'
import PuzzlePicker from './components/PuzzlePicker'
import PuzzleScreen from './components/PuzzleScreen'
import FinishedGallery from './components/FinishedGallery'
import './App.css'

type Screen =
  | { screen: 'gallery' }
  | { screen: 'picker'; groupKey: string }
  | { screen: 'puzzle'; puzzleId: string; mode: PaintMode }
  | { screen: 'finished' }

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

  const groups = useMemo(() => groupPuzzlesByImage(puzzles), [puzzles])

  function goToGallery() {
    setScreen({ screen: 'gallery' })
  }

  if (screen.screen === 'picker') {
    const group = groups.find((g) => g.key === screen.groupKey)
    if (!group) {
      return <Gallery groups={groups} loading={loading} onSelectImage={(groupKey) => setScreen({ screen: 'picker', groupKey })} onShowFinished={() => setScreen({ screen: 'finished' })} />
    }
    return (
      <PuzzlePicker
        group={group}
        onStart={(puzzleId, mode) => setScreen({ screen: 'puzzle', puzzleId, mode })}
        onExit={goToGallery}
      />
    )
  }

  if (screen.screen === 'puzzle') {
    const puzzle = puzzles.find((p) => p.id === screen.puzzleId)
    if (!puzzle) {
      return <Gallery groups={groups} loading={loading} onSelectImage={(groupKey) => setScreen({ screen: 'picker', groupKey })} onShowFinished={() => setScreen({ screen: 'finished' })} />
    }
    return (
      <PuzzleScreen
        puzzle={puzzle}
        mode={screen.mode}
        onExit={goToGallery}
        onFinished={() => setScreen({ screen: 'finished' })}
      />
    )
  }

  if (screen.screen === 'finished') {
    return <FinishedGallery onExit={goToGallery} />
  }

  return (
    <Gallery
      groups={groups}
      loading={loading}
      onSelectImage={(groupKey) => setScreen({ screen: 'picker', groupKey })}
      onShowFinished={() => setScreen({ screen: 'finished' })}
    />
  )
}

export default App
