import { useState } from 'react'
import type { Difficulty, PaintMode } from '../types/puzzle'
import type { PuzzleGroup } from '../lib/puzzleGroups'

interface PuzzlePickerProps {
  group: PuzzleGroup
  onStart: (puzzleId: string, mode: PaintMode) => void
  onExit: () => void
}

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']
const DIFFICULTY_ICON: Record<Difficulty, string> = { easy: '🟢', medium: '🟡', hard: '🔴' }

function capitalize(s: string) {
  return s[0].toUpperCase() + s.slice(1)
}

export default function PuzzlePicker({ group, onStart, onExit }: PuzzlePickerProps) {
  const [step, setStep] = useState<'mode' | 'difficulty'>('mode')
  const [selectedMode, setSelectedMode] = useState<PaintMode | null>(null)

  function chooseMode(mode: PaintMode) {
    setSelectedMode(mode)
    setStep('difficulty')
  }

  function chooseDifficulty(difficulty: Difficulty) {
    const variant = group.variants[difficulty]
    if (!variant || !selectedMode) return
    onStart(variant.id, selectedMode)
  }

  const availableDifficulties = DIFFICULTIES.filter((d) => group.variants[d])

  return (
    <main className="puzzle-screen">
      <div className="puzzle-header">
        <button className="back-button" onClick={step === 'difficulty' ? () => setStep('mode') : onExit}>
          ← Back
        </button>
        <h2>{group.name}</h2>
        <div className="puzzle-header-actions" />
      </div>

      <img className="picker-preview" src={group.thumbnail} alt={group.name} />

      {step === 'mode' ? (
        <div className="picker-options">
          <button className="primary-button" onClick={() => chooseMode('numbers')}>
            🔢 Paint by Number
          </button>
          <button className="primary-button" onClick={() => chooseMode('free')}>
            🎨 Free Paint
          </button>
        </div>
      ) : (
        <div className="picker-options">
          {availableDifficulties.map((difficulty) => {
            const variant = group.variants[difficulty]!
            const colorCount = Object.keys(variant.palette).length
            return (
              <button key={difficulty} className="primary-button" onClick={() => chooseDifficulty(difficulty)}>
                {DIFFICULTY_ICON[difficulty]} {capitalize(difficulty)} · {colorCount} colors
              </button>
            )
          })}
        </div>
      )}
    </main>
  )
}
