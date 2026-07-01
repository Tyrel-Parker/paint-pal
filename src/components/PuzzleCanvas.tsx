import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import type { Puzzle } from '../types/puzzle'
import { buildRegionIndex, drawRegionLabels, findRegionAtPixel, paintFullBuffer, paintRegionFill } from '../lib/canvasRender'

export interface PuzzleCanvasHandle {
  captureSnapshot(): string
}

interface PuzzleCanvasProps {
  puzzle: Puzzle
  filledRegions: Record<number, string>
  showLabels: boolean
  onRegionTap: (regionId: number) => void
}

const TAP_MOVE_THRESHOLD_PX = 10
const TAP_MAX_DURATION_MS = 500

const PuzzleCanvas = forwardRef<PuzzleCanvasHandle, PuzzleCanvasProps>(
  ({ puzzle, filledRegions, showLabels, onRegionTap }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const imageDataRef = useRef<ImageData | null>(null)
    const lastRegionIndexRef = useRef<ReturnType<typeof buildRegionIndex> | null>(null)
    const lastFilledRef = useRef<Record<number, string>>({})
    const pointerStart = useRef<{ x: number; y: number; time: number } | null>(null)

    const regionIndex = useMemo(() => buildRegionIndex(puzzle.labelMap), [puzzle.labelMap])

    useEffect(() => {
      const ctx = canvasRef.current?.getContext('2d')
      if (!ctx) return

      let imageData = imageDataRef.current
      const isNewRegionIndex = lastRegionIndexRef.current !== regionIndex
      const prev = lastFilledRef.current
      // A region present in `prev` but missing from `filledRegions` means a fill was removed
      // (e.g. "clear and start over") — paintRegionFill can only apply a color, not remove one,
      // so that case needs a full repaint rather than an incremental diff.
      const hasRemovedFill = Object.keys(prev).some((key) => !(key in filledRegions))

      if (!imageData || isNewRegionIndex || hasRemovedFill) {
        imageData = ctx.createImageData(regionIndex.width, regionIndex.height)
        paintFullBuffer(imageData, regionIndex, filledRegions)
        imageDataRef.current = imageData
        lastRegionIndexRef.current = regionIndex
      } else {
        for (const key of Object.keys(filledRegions)) {
          const regionId = Number(key)
          if (filledRegions[regionId] !== prev[regionId]) {
            paintRegionFill(imageData, regionIndex, regionId, filledRegions[regionId])
          }
        }
      }
      lastFilledRef.current = filledRegions

      ctx.putImageData(imageData, 0, 0)
      if (showLabels) drawRegionLabels(ctx, puzzle.regions)
    }, [regionIndex, filledRegions, showLabels, puzzle.regions])

    useImperativeHandle(ref, () => ({
      captureSnapshot() {
        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d')
        const imageData = imageDataRef.current
        if (!canvas || !ctx || !imageData) return ''

        ctx.putImageData(imageData, 0, 0)
        const dataUrl = canvas.toDataURL('image/png')
        if (showLabels) drawRegionLabels(ctx, puzzle.regions)
        return dataUrl
      },
    }))

    function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
      pointerStart.current = { x: e.clientX, y: e.clientY, time: Date.now() }
    }

    function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
      const start = pointerStart.current
      pointerStart.current = null
      if (!start) return

      const movedPx = Math.hypot(e.clientX - start.x, e.clientY - start.y)
      const elapsedMs = Date.now() - start.time
      if (movedPx > TAP_MOVE_THRESHOLD_PX || elapsedMs > TAP_MAX_DURATION_MS) return

      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      const x = Math.floor((e.clientX - rect.left) * scaleX)
      const y = Math.floor((e.clientY - rect.top) * scaleY)

      const regionId = findRegionAtPixel(regionIndex, x, y)
      if (regionId !== undefined) onRegionTap(regionId)
    }

    return (
      <canvas
        ref={canvasRef}
        width={puzzle.width}
        height={puzzle.height}
        className="puzzle-canvas"
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      />
    )
  },
)

PuzzleCanvas.displayName = 'PuzzleCanvas'

export default PuzzleCanvas
