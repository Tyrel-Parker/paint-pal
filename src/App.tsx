import { useEffect, useMemo, useState } from 'react'
import { fetchBuiltinPuzzles } from './lib/manifest'
import { deleteProgress, deleteUserPuzzle, getUserPuzzles } from './lib/storage'
import { groupPuzzlesByImage, type PuzzleGroup } from './lib/puzzleGroups'
import type { FinishedWork, Puzzle } from './types/puzzle'
import Gallery from './components/Gallery'
import PuzzlePicker, { type PickerStep } from './components/PuzzlePicker'
import PuzzleScreen from './components/PuzzleScreen'
import FreePaintScreen from './components/FreePaintScreen'
import FinishedGallery from './components/FinishedGallery'
import AddPhotoScreen from './components/AddPhotoScreen'
import ArtworkViewer from './components/ArtworkViewer'
import './App.css'

type Screen =
  | { screen: 'gallery' }
  | { screen: 'picker'; groupKey: string; step?: PickerStep }
  | { screen: 'puzzle'; puzzleId: string }
  | { screen: 'freepaint'; groupKey: string }
  | { screen: 'finished' }
  | { screen: 'addphoto'; file: File }
  /** Full-size display of one finished piece; 'celebrate' is the post-finish linger. */
  | { screen: 'artwork'; work: FinishedWork; from: 'celebrate' | 'finished' }

const DIFFICULTY_SUFFIX = /-(easy|medium|hard)$/

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

  async function handleDeleteGroup(group: PuzzleGroup) {
    const variants = Object.values(group.variants)
    for (const variant of variants) {
      await deleteUserPuzzle(variant.id)
      await deleteProgress(variant.id, 'numbers')
    }
    await deleteProgress(group.key, 'free')
    const removed = new Set(variants.map((v) => v.id))
    setPuzzles((prev) => prev.filter((p) => !removed.has(p.id)))
  }

  function handlePhotoSaved(newPuzzles: Puzzle[]) {
    setPuzzles((prev) => [...prev, ...newPuzzles])
    setScreen({ screen: 'picker', groupKey: newPuzzles[0].id.replace(DIFFICULTY_SUFFIX, '') })
  }

  function renderGallery() {
    return (
      <Gallery
        groups={groups}
        loading={loading}
        onSelectImage={(groupKey) => setScreen({ screen: 'picker', groupKey })}
        onShowFinished={() => setScreen({ screen: 'finished' })}
        onAddPhoto={(file) => setScreen({ screen: 'addphoto', file })}
        onDeleteGroup={handleDeleteGroup}
      />
    )
  }

  if (screen.screen === 'addphoto') {
    return <AddPhotoScreen file={screen.file} onSaved={handlePhotoSaved} onCancel={goToGallery} />
  }

  if (screen.screen === 'picker') {
    const group = groups.find((g) => g.key === screen.groupKey)
    if (!group) return renderGallery()
    return (
      <PuzzlePicker
        key={`${group.key}:${screen.step ?? 'mode'}`}
        group={group}
        initialStep={screen.step}
        onStartNumbers={(puzzleId) => setScreen({ screen: 'puzzle', puzzleId })}
        onStartFree={(groupKey) => setScreen({ screen: 'freepaint', groupKey })}
        onExit={goToGallery}
      />
    )
  }

  if (screen.screen === 'puzzle') {
    const puzzle = puzzles.find((p) => p.id === screen.puzzleId)
    if (!puzzle) return renderGallery()
    const groupKey = puzzle.id.replace(DIFFICULTY_SUFFIX, '')
    return (
      <PuzzleScreen
        puzzle={puzzle}
        baseCrumbs={[
          { label: '🏠 Gallery', onTap: goToGallery },
          { label: puzzle.name, onTap: () => setScreen({ screen: 'picker', groupKey }) },
          { label: '🔢', onTap: () => setScreen({ screen: 'picker', groupKey, step: 'difficulty' }) },
        ]}
        onFinished={(work) => setScreen({ screen: 'artwork', work, from: 'celebrate' })}
      />
    )
  }

  if (screen.screen === 'freepaint') {
    const group = groups.find((g) => g.key === screen.groupKey)
    if (!group) return renderGallery()
    return (
      <FreePaintScreen
        group={group}
        baseCrumbs={[
          { label: '🏠 Gallery', onTap: goToGallery },
          { label: group.name, onTap: () => setScreen({ screen: 'picker', groupKey: group.key }) },
        ]}
        onFinished={(work) => setScreen({ screen: 'artwork', work, from: 'celebrate' })}
      />
    )
  }

  if (screen.screen === 'finished') {
    return (
      <FinishedGallery
        onExit={goToGallery}
        onSelectWork={(work) => setScreen({ screen: 'artwork', work, from: 'finished' })}
      />
    )
  }

  if (screen.screen === 'artwork') {
    const crumbs =
      screen.from === 'finished'
        ? [
            { label: '🏠 Gallery', onTap: goToGallery },
            { label: '🖼️ Finished', onTap: () => setScreen({ screen: 'finished' }) },
            { label: screen.work.puzzleName },
          ]
        : [{ label: '🏠 Gallery', onTap: goToGallery }, { label: screen.work.puzzleName }]
    return <ArtworkViewer work={screen.work} crumbs={crumbs} celebrate={screen.from === 'celebrate'} />
  }

  return renderGallery()
}

export default App
