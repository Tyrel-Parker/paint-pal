import { useEffect, useRef, useState } from 'react'
import type { Puzzle } from '../types/puzzle'
import { processPhotoAll, type ProcessStage } from '../lib/processPhoto'
import { saveUserPuzzle } from '../lib/storage'
import Breadcrumbs from './Breadcrumbs'

interface AddPhotoScreenProps {
  /** The photo picked from the gallery; the user can swap it here without leaving. */
  initialFile: File
  onSaved: (puzzles: Puzzle[]) => void
  onCancel: () => void
}

const STAGE_ORDER: ProcessStage[] = ['loading-model', 'finding-subject', 'outline', 'easy', 'medium', 'hard']

const STAGE_LABEL: Record<ProcessStage, string> = {
  'loading-model': 'Warming up the art robot (first time takes a bit)',
  'finding-subject': 'Finding what to paint',
  outline: 'Drawing the coloring-book outline',
  easy: 'Building the Easy puzzle',
  medium: 'Building the Medium puzzle',
  hard: 'Building the Hard puzzle',
}

function defaultName(fileName: string): string {
  const base = fileName.replace(/\.[^.]*$/, '').replace(/[-_]+/g, ' ').trim()
  if (!base) return 'My Picture'
  return base
    .split(' ')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ')
}

export default function AddPhotoScreen({ initialFile, onSaved, onCancel }: AddPhotoScreenProps) {
  const [file, setFile] = useState(initialFile)
  const [name, setName] = useState(() => defaultName(initialFile.name))
  const [stage, setStage] = useState<ProcessStage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const repickInputRef = useRef<HTMLInputElement>(null)

  // Created inside the effect (not useMemo) so StrictMode's mount→unmount→mount
  // cycle gets a fresh URL after the cleanup revokes the first one.
  const [previewUrl, setPreviewUrl] = useState<string>()
  useEffect(() => {
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function handleRepick(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.files?.[0]
    if (next) {
      setFile(next)
      setName(defaultName(next.name))
      setError(null)
    }
    e.target.value = ''
  }

  const processing = stage !== null && error === null

  async function handleStart() {
    setError(null)
    setStage('loading-model')
    try {
      const puzzles = await processPhotoAll(file, `user-${Date.now()}`, name.trim() || 'My Picture', setStage)
      for (const puzzle of puzzles) await saveUserPuzzle(puzzle)
      onSaved(puzzles)
    } catch (e) {
      console.error(e)
      // A failed dynamic import means this page is a stale deploy whose lazy
      // chunk no longer exists on the server — reloading picks up the current
      // version. Guarded so a genuinely broken deploy can't reload-loop.
      const staleChunk = /dynamically imported module|Failed to fetch|Importing a module script failed/i.test(
        String(e),
      )
      if (staleChunk && !sessionStorage.getItem('paint-pal-reloaded-for-update')) {
        sessionStorage.setItem('paint-pal-reloaded-for-update', '1')
        window.location.reload()
        return
      }
      setError('Something went wrong while preparing your photo. Please try again.')
      setStage(null)
    }
  }

  const stageIndex = stage ? STAGE_ORDER.indexOf(stage) : -1

  return (
    <main className="puzzle-screen">
      <div className="puzzle-header">
        <Breadcrumbs
          crumbs={[
            { label: '🏠', onTap: processing ? undefined : onCancel },
            { label: '＋ Add photo' },
          ]}
        />
        <div className="puzzle-header-actions" />
      </div>

      <img className="picker-preview" src={previewUrl} alt="Your photo" />

      {processing ? (
        <ol className="process-stage-list">
          {STAGE_ORDER.map((s, i) => (
            <li key={s} className={i < stageIndex ? 'done' : i === stageIndex ? 'active' : ''}>
              {i < stageIndex ? '✅' : i === stageIndex ? '✨' : '· '} {STAGE_LABEL[s]}
              {i === stageIndex ? '…' : ''}
            </li>
          ))}
        </ol>
      ) : (
        <div className="picker-options">
          <input ref={repickInputRef} type="file" accept="image/*" hidden onChange={handleRepick} />
          <button className="repick-button" onClick={() => repickInputRef.current?.click()}>
            📷 Pick a different photo
          </button>
          <label className="add-photo-name">
            Name
            <input
              type="text"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Picture"
            />
          </label>
          {error && <p className="add-photo-error">{error}</p>}
          <button className="primary-button" onClick={handleStart}>
            🪄 Make it paintable
          </button>
          <p className="add-photo-hint">
            Your photo is turned into puzzles right here on this device — it never leaves it.
          </p>
        </div>
      )}
    </main>
  )
}
