import { useEffect, useMemo, useRef, useState } from 'react'
import type { FinishedWork, Palette, Progress, Puzzle } from '../types/puzzle'
import { deleteProgress, getProgress, saveFinishedWork, saveProgress } from '../lib/storage'
import { matchFillNumbers } from '../lib/fillRules'
import PuzzleCanvas, { type PuzzleCanvasHandle } from './PuzzleCanvas'
import PaletteEditor from './PaletteEditor'
import Breadcrumbs, { type Crumb } from './Breadcrumbs'

interface PuzzleScreenProps {
  puzzle: Puzzle
  /** Path back up (Gallery / picture / mode); this screen appends the difficulty. */
  baseCrumbs: Crumb[]
  onShowFinished: () => void
  onFinished: (work: FinishedWork) => void
}

type Phase = 'palette-editor' | 'painting'

const MODE = 'numbers' as const

function capitalize(s: string) {
  return s[0].toUpperCase() + s.slice(1)
}

export default function PuzzleScreen({ puzzle, baseCrumbs, onShowFinished, onFinished }: PuzzleScreenProps) {
  const [status, setStatus] = useState<'loading' | 'ready'>('loading')
  const [phase, setPhase] = useState<Phase>('palette-editor')
  const [filledRegions, setFilledRegions] = useState<Record<number, string>>({})
  const [customPalette, setCustomPalette] = useState<Palette | undefined>(undefined)
  const [selectedColorNumber, setSelectedColorNumber] = useState<number | null>(null)

  const canvasRef = useRef<PuzzleCanvasHandle>(null)
  const hasAutoFinishedRef = useRef(false)

  const palette = useMemo(() => customPalette ?? puzzle.palette, [customPalette, puzzle.palette])

  useEffect(() => {
    let cancelled = false
    getProgress(puzzle.id, MODE).then((progress) => {
      if (cancelled) return
      if (progress) {
        setFilledRegions(progress.filledRegions)
        setCustomPalette(progress.customPalette)
        setPhase('painting')
        if (Object.keys(progress.filledRegions).length === puzzle.regions.length) {
          hasAutoFinishedRef.current = true
        }
      }
      setStatus('ready')
    })
    return () => {
      cancelled = true
    }
  }, [puzzle.id, puzzle.regions.length])

  function persist(nextFilled: Record<number, string>, nextPalette: Palette | undefined) {
    const progress: Progress = {
      key: `${puzzle.id}:${MODE}`,
      puzzleId: puzzle.id,
      mode: MODE,
      filledRegions: nextFilled,
      customPalette: nextPalette,
      updatedAt: Date.now(),
    }
    saveProgress(progress)
  }

  function handleRegionTap(regionId: number) {
    const region = puzzle.regions.find((r) => r.id === regionId)
    if (!region) return

    const colorHex = matchFillNumbers(region, palette, selectedColorNumber)
    if (colorHex === null) return

    const next = { ...filledRegions, [regionId]: colorHex }
    setFilledRegions(next)
    persist(next, customPalette)

    if (!hasAutoFinishedRef.current && Object.keys(next).length === puzzle.regions.length) {
      hasAutoFinishedRef.current = true
      handleFinish()
    }
  }

  async function handleFinish() {
    const image = canvasRef.current?.captureSnapshot()
    if (!image) return
    const work: FinishedWork = {
      key: `${puzzle.id}:${MODE}:${Date.now()}`,
      puzzleId: puzzle.id,
      mode: MODE,
      puzzleName: puzzle.name,
      completedAt: Date.now(),
      image,
    }
    await saveFinishedWork(work)
    // Finished pieces live in the finished gallery; the puzzle itself resets
    // so coming back to it starts a fresh page.
    await deleteProgress(puzzle.id, MODE)
    onFinished(work)
  }

  async function handleClear() {
    if (!confirm('Clear your progress and start this puzzle over?')) return
    setFilledRegions({})
    hasAutoFinishedRef.current = false
    await deleteProgress(puzzle.id, MODE)
  }

  function handlePaletteDone() {
    setPhase('painting')
    persist(filledRegions, customPalette)
  }

  if (status === 'loading') {
    return <p className="loading">Loading...</p>
  }

  const crumbs = [...baseCrumbs, { label: capitalize(puzzle.difficulty) }]

  if (phase === 'palette-editor') {
    return (
      <main className="puzzle-screen">
        <Breadcrumbs crumbs={crumbs} />
        <PaletteEditor palette={palette} onChange={setCustomPalette} onDone={handlePaletteDone} />
      </main>
    )
  }

  const paletteEntries = Object.entries(palette)
    .map(([number, hex]) => [Number(number), hex] as const)
    .sort((a, b) => a[0] - b[0])

  return (
    <main className="puzzle-screen">
      <div className="puzzle-header">
        <Breadcrumbs crumbs={crumbs} />
        <div className="puzzle-header-actions">
          <button onClick={() => setPhase('palette-editor')} aria-label="Edit colors">
            🎨
          </button>
          <button onClick={handleClear} aria-label="Clear and start over">
            🔄
          </button>
          <button onClick={onShowFinished} aria-label="Finished gallery">
            🖼️
          </button>
        </div>
      </div>

      <PuzzleCanvas
        ref={canvasRef}
        puzzle={puzzle}
        filledRegions={filledRegions}
        showLabels
        onRegionTap={handleRegionTap}
      />

      <ul className="palette-swatch-list playing">
        {paletteEntries.map(([colorNumber, hex]) => (
          <li key={colorNumber}>
            <button
              className={`palette-swatch${colorNumber === selectedColorNumber ? ' selected' : ''}`}
              style={{ backgroundColor: hex }}
              onClick={() => setSelectedColorNumber(colorNumber)}
            >
              {colorNumber}
            </button>
          </li>
        ))}
      </ul>
    </main>
  )
}
