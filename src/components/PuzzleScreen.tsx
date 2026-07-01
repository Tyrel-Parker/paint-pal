import { useEffect, useMemo, useRef, useState } from 'react'
import type { Palette, PaintMode, Progress, Puzzle } from '../types/puzzle'
import { deleteProgress, getProgress, saveFinishedWork, saveProgress } from '../lib/storage'
import { matchFillNumbers, freeFill } from '../lib/fillRules'
import PuzzleCanvas, { type PuzzleCanvasHandle } from './PuzzleCanvas'
import PaletteEditor from './PaletteEditor'
import ColorPicker from './ColorPicker'
import { PRESET_COLORS } from '../lib/colorPresets'

interface PuzzleScreenProps {
  puzzle: Puzzle
  mode: PaintMode
  onExit: () => void
  onFinished: () => void
}

type Phase = 'palette-editor' | 'painting'

export default function PuzzleScreen({ puzzle, mode, onExit, onFinished }: PuzzleScreenProps) {
  const [status, setStatus] = useState<'loading' | 'ready'>('loading')
  const [phase, setPhase] = useState<Phase>(mode === 'numbers' ? 'palette-editor' : 'painting')
  const [filledRegions, setFilledRegions] = useState<Record<number, string>>({})
  const [customPalette, setCustomPalette] = useState<Palette | undefined>(undefined)
  const [selectedColorNumber, setSelectedColorNumber] = useState<number | null>(null)
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0])

  const canvasRef = useRef<PuzzleCanvasHandle>(null)
  const hasAutoFinishedRef = useRef(false)

  const palette = useMemo(() => customPalette ?? puzzle.palette, [customPalette, puzzle.palette])

  useEffect(() => {
    let cancelled = false
    getProgress(puzzle.id, mode).then((progress) => {
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
  }, [puzzle.id, mode, puzzle.regions.length])

  function persist(nextFilled: Record<number, string>, nextPalette: Palette | undefined) {
    const progress: Progress = {
      key: `${puzzle.id}:${mode}`,
      puzzleId: puzzle.id,
      mode,
      filledRegions: nextFilled,
      customPalette: nextPalette,
      updatedAt: Date.now(),
    }
    saveProgress(progress)
  }

  function handleRegionTap(regionId: number) {
    const region = puzzle.regions.find((r) => r.id === regionId)
    if (!region) return

    const colorHex = mode === 'numbers' ? matchFillNumbers(region, palette, selectedColorNumber) : freeFill(selectedColor)
    if (colorHex === null) return

    const next = { ...filledRegions, [regionId]: colorHex }
    setFilledRegions(next)
    persist(next, customPalette)

    if (mode === 'numbers' && !hasAutoFinishedRef.current && Object.keys(next).length === puzzle.regions.length) {
      hasAutoFinishedRef.current = true
      handleFinish()
    }
  }

  async function handleFinish() {
    const image = canvasRef.current?.captureSnapshot()
    if (!image) return
    await saveFinishedWork({
      key: `${puzzle.id}:${mode}:${Date.now()}`,
      puzzleId: puzzle.id,
      mode,
      puzzleName: puzzle.name,
      completedAt: Date.now(),
      image,
    })
    onFinished()
  }

  async function handleClear() {
    if (!confirm('Clear your progress and start this puzzle over?')) return
    setFilledRegions({})
    hasAutoFinishedRef.current = false
    await deleteProgress(puzzle.id, mode)
  }

  function handlePaletteDone() {
    setPhase('painting')
    persist(filledRegions, customPalette)
  }

  if (status === 'loading') {
    return <p className="loading">Loading...</p>
  }

  if (mode === 'numbers' && phase === 'palette-editor') {
    return (
      <main className="puzzle-screen">
        <button className="back-button" onClick={onExit}>
          ← Back
        </button>
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
        <button className="back-button" onClick={onExit}>
          ← Back
        </button>
        <h2>{puzzle.name}</h2>
        <div className="puzzle-header-actions">
          {mode === 'numbers' && (
            <button onClick={() => setPhase('palette-editor')} aria-label="Edit colors">
              🎨
            </button>
          )}
          <button onClick={handleClear} aria-label="Clear and start over">
            🔄
          </button>
        </div>
      </div>

      <PuzzleCanvas
        ref={canvasRef}
        puzzle={puzzle}
        filledRegions={filledRegions}
        showLabels={mode === 'numbers'}
        onRegionTap={handleRegionTap}
      />

      {mode === 'numbers' ? (
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
      ) : (
        <>
          <ColorPicker value={selectedColor} onChange={setSelectedColor} />
          <button className="primary-button" onClick={handleFinish}>
            I'm done! 🎉
          </button>
        </>
      )}
    </main>
  )
}
