import { useState } from 'react'
import type { Difficulty } from '../types/puzzle'
import type { PuzzleGroup } from '../lib/puzzleGroups'
import Breadcrumbs from './Breadcrumbs'

export type PickerStep = 'mode' | 'difficulty'

interface PuzzlePickerProps {
  group: PuzzleGroup
  initialStep?: PickerStep
  onStartNumbers: (puzzleId: string) => void
  onStartFree: (groupKey: string) => void
  onShowFinished: () => void
  onExit: () => void
}

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']
const DIFFICULTY_ICON: Record<Difficulty, string> = { easy: '🟢', medium: '🟡', hard: '🔴' }

function capitalize(s: string) {
  return s[0].toUpperCase() + s.slice(1)
}

export default function PuzzlePicker({
  group,
  initialStep = 'mode',
  onStartNumbers,
  onStartFree,
  onShowFinished,
  onExit,
}: PuzzlePickerProps) {
  const [step, setStep] = useState<PickerStep>(initialStep)

  const availableDifficulties = DIFFICULTIES.filter((d) => group.variants[d])

  const crumbs =
    step === 'mode'
      ? [{ label: '🏠', onTap: onExit }, { label: group.name }]
      : [
          { label: '🏠', onTap: onExit },
          { label: group.name, onTap: () => setStep('mode') },
          { label: 'Paint by Number' },
        ]

  return (
    <main className="puzzle-screen">
      <div className="puzzle-header">
        <Breadcrumbs crumbs={crumbs} />
        <div className="puzzle-header-actions">
          <button onClick={onShowFinished} aria-label="Finished gallery">
            🖼️
          </button>
        </div>
      </div>

      <img className="picker-preview" src={group.thumbnail} alt={group.name} />

      {step === 'mode' ? (
        <div className="picker-options">
          <button className="primary-button" onClick={() => setStep('difficulty')}>
            🔢 Paint by Number
          </button>
          <button className="primary-button" onClick={() => onStartFree(group.key)}>
            🎨 Free Paint
          </button>
        </div>
      ) : (
        <div className="picker-options">
          {availableDifficulties.map((difficulty) => {
            const variant = group.variants[difficulty]!
            const colorCount = Object.keys(variant.palette).length
            return (
              <button key={difficulty} className="primary-button" onClick={() => onStartNumbers(variant.id)}>
                {DIFFICULTY_ICON[difficulty]} {capitalize(difficulty)} · {colorCount} colors
              </button>
            )
          })}
        </div>
      )}
    </main>
  )
}
