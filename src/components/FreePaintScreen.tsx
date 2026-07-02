import { useEffect, useRef, useState } from 'react'
import type { Progress } from '../types/puzzle'
import { deleteProgress, getProgress, saveFinishedWork, saveProgress } from '../lib/storage'
import type { PuzzleGroup } from '../lib/puzzleGroups'
import FreePaintCanvas, { type FreePaintCanvasHandle } from './FreePaintCanvas'
import ColorPicker from './ColorPicker'
import { PRESET_COLORS } from '../lib/colorPresets'

interface FreePaintScreenProps {
  group: PuzzleGroup
  onExit: () => void
  onFinished: () => void
}

export default function FreePaintScreen({ group, onExit, onFinished }: FreePaintScreenProps) {
  const [status, setStatus] = useState<'loading' | 'ready'>('loading')
  const [paintedImage, setPaintedImage] = useState<string | undefined>(undefined)
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [resetKey, setResetKey] = useState(0)

  const canvasRef = useRef<FreePaintCanvasHandle>(null)

  useEffect(() => {
    let cancelled = false
    getProgress(group.key, 'free').then((progress) => {
      if (cancelled) return
      if (progress) setPaintedImage(progress.paintedImage)
      setStatus('ready')
    })
    return () => {
      cancelled = true
    }
  }, [group.key])

  function handleStrokeEnd(dataUrl: string) {
    setPaintedImage(dataUrl)
    const progress: Progress = {
      key: `${group.key}:free`,
      puzzleId: group.key,
      mode: 'free',
      filledRegions: {},
      paintedImage: dataUrl,
      updatedAt: Date.now(),
    }
    saveProgress(progress)
  }

  async function handleClear() {
    if (!confirm('Clear your painting and start over?')) return
    setPaintedImage(undefined)
    setResetKey((k) => k + 1)
    await deleteProgress(group.key, 'free')
  }

  async function handleFinish() {
    const image = canvasRef.current?.captureSnapshot()
    if (!image) return
    await saveFinishedWork({
      key: `${group.key}:free:${Date.now()}`,
      puzzleId: group.key,
      mode: 'free',
      puzzleName: group.name,
      completedAt: Date.now(),
      image,
    })
    onFinished()
  }

  if (status === 'loading') {
    return <p className="loading">Loading...</p>
  }

  return (
    <main className="puzzle-screen">
      <div className="puzzle-header">
        <button className="back-button" onClick={onExit}>
          ← Back
        </button>
        <h2>{group.name}</h2>
        <div className="puzzle-header-actions">
          <button onClick={handleClear} aria-label="Clear and start over">
            🔄
          </button>
        </div>
      </div>

      <FreePaintCanvas
        key={resetKey}
        ref={canvasRef}
        outlineSrc={group.outline}
        width={group.outlineWidth}
        height={group.outlineHeight}
        color={color}
        initialImage={paintedImage}
        onStrokeEnd={handleStrokeEnd}
      />

      <ColorPicker value={color} onChange={setColor} />
      <button className="primary-button" onClick={handleFinish}>
        I'm done! 🎉
      </button>
    </main>
  )
}
