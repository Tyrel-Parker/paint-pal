import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
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
const MIN_SCALE = 1
const MAX_SCALE = 8
/** Below this, a pinch-out snaps back to exactly 1 so the reset button disappears. */
const SNAP_TO_FIT_SCALE = 1.05

interface Transform {
  scale: number
  tx: number
  ty: number
}

const PuzzleCanvas = forwardRef<PuzzleCanvasHandle, PuzzleCanvasProps>(
  ({ puzzle, filledRegions, showLabels, onRegionTap }, ref) => {
    const viewportRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const imageDataRef = useRef<ImageData | null>(null)
    const lastRegionIndexRef = useRef<ReturnType<typeof buildRegionIndex> | null>(null)
    const lastFilledRef = useRef<Record<number, string>>({})
    const showLabelsRef = useRef(showLabels)

    // Gesture state (refs: pointer math shouldn't re-render React)
    const pointersRef = useRef(new Map<number, { x: number; y: number }>())
    const transformRef = useRef<Transform>({ scale: 1, tx: 0, ty: 0 })
    const pinchBaselineRef = useRef<{ dist: number; mx: number; my: number } | null>(null)
    const panLastRef = useRef<{ x: number; y: number } | null>(null)
    const tapCandidateRef = useRef<{ x: number; y: number; time: number } | null>(null)
    const [isZoomed, setIsZoomed] = useState(false)

    const regionIndex = useMemo(() => buildRegionIndex(puzzle.labelMap), [puzzle.labelMap])

    showLabelsRef.current = showLabels

    function repaintFromBuffer() {
      const ctx = canvasRef.current?.getContext('2d')
      const imageData = imageDataRef.current
      if (!ctx || !imageData) return
      ctx.putImageData(imageData, 0, 0)
      if (showLabelsRef.current) drawRegionLabels(ctx, puzzle.regions)
    }

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

      repaintFromBuffer()
      // repaintFromBuffer reads puzzle.regions for labels; regionIndex changes with the puzzle.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [regionIndex, filledRegions, showLabels, puzzle.regions])

    // Mobile browsers evict canvas backing stores under memory pressure or
    // while the tab is backgrounded — the bitmap comes back blank (numbers
    // and fills gone) with no React state change to trigger a repaint.
    // Repaint from the retained buffer whenever the page becomes visible again.
    useEffect(() => {
      const onVisible = () => {
        if (!document.hidden) repaintFromBuffer()
      }
      document.addEventListener('visibilitychange', onVisible)
      window.addEventListener('pageshow', onVisible)
      window.addEventListener('focus', onVisible)
      return () => {
        document.removeEventListener('visibilitychange', onVisible)
        window.removeEventListener('pageshow', onVisible)
        window.removeEventListener('focus', onVisible)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [puzzle.regions])

    useImperativeHandle(ref, () => ({
      captureSnapshot() {
        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d')
        const imageData = imageDataRef.current
        if (!canvas || !ctx || !imageData) return ''

        ctx.putImageData(imageData, 0, 0)
        const dataUrl = canvas.toDataURL('image/png')
        if (showLabelsRef.current) drawRegionLabels(ctx, puzzle.regions)
        return dataUrl
      },
    }))

    function applyTransform(next: Transform) {
      const viewport = viewportRef.current
      const canvas = canvasRef.current
      if (!viewport || !canvas) return

      const vw = viewport.clientWidth
      const vh = viewport.clientHeight
      let { scale, tx, ty } = next
      scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
      if (scale < SNAP_TO_FIT_SCALE) {
        scale = 1
        tx = 0
        ty = 0
      }
      // Keep the (scaled) canvas covering the viewport — no white gaps.
      tx = Math.min(0, Math.max(vw - vw * scale, tx))
      ty = Math.min(0, Math.max(vh - vh * scale, ty))

      transformRef.current = { scale, tx, ty }
      canvas.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`
      setIsZoomed(scale > 1)
    }

    function resetZoom() {
      applyTransform({ scale: 1, tx: 0, ty: 0 })
    }

    // Reset zoom when switching puzzles.
    useEffect(() => {
      resetZoom()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [regionIndex])

    function viewportPoint(e: React.PointerEvent): { x: number; y: number } {
      const rect = viewportRef.current!.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
      try {
        viewportRef.current?.setPointerCapture(e.pointerId)
      } catch {
        // Non-capturable pointer (synthetic/stale id) — gesture tracking still works.
      }
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

      if (pointersRef.current.size === 1) {
        tapCandidateRef.current = { x: e.clientX, y: e.clientY, time: Date.now() }
        panLastRef.current = viewportPoint(e)
      } else {
        // A second finger means pinch, never a tap.
        tapCandidateRef.current = null
        panLastRef.current = null
        if (pointersRef.current.size === 2) {
          const [a, b] = [...pointersRef.current.values()]
          const rect = viewportRef.current!.getBoundingClientRect()
          pinchBaselineRef.current = {
            dist: Math.hypot(a.x - b.x, a.y - b.y),
            mx: (a.x + b.x) / 2 - rect.left,
            my: (a.y + b.y) / 2 - rect.top,
          }
        } else {
          pinchBaselineRef.current = null
        }
      }
    }

    function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
      const pointers = pointersRef.current
      if (!pointers.has(e.pointerId)) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

      if (pointers.size === 2 && pinchBaselineRef.current) {
        const [a, b] = [...pointers.values()]
        const rect = viewportRef.current!.getBoundingClientRect()
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        const mx = (a.x + b.x) / 2 - rect.left
        const my = (a.y + b.y) / 2 - rect.top
        const baseline = pinchBaselineRef.current
        if (baseline.dist > 0 && dist > 0) {
          const { scale, tx, ty } = transformRef.current
          const ratio = dist / baseline.dist
          const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * ratio))
          const applied = nextScale / scale
          applyTransform({
            scale: nextScale,
            // Zoom about the pinch midpoint, then follow the midpoint's drag.
            tx: mx - (mx - tx) * applied + (mx - baseline.mx),
            ty: my - (my - ty) * applied + (my - baseline.my),
          })
        }
        pinchBaselineRef.current = { dist, mx, my }
        return
      }

      if (pointers.size === 1 && transformRef.current.scale > 1 && panLastRef.current) {
        const point = viewportPoint(e)
        const { scale, tx, ty } = transformRef.current
        applyTransform({ scale, tx: tx + point.x - panLastRef.current.x, ty: ty + point.y - panLastRef.current.y })
        panLastRef.current = point
      }
    }

    function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
      const pointers = pointersRef.current
      pointers.delete(e.pointerId)
      pinchBaselineRef.current = null
      if (pointers.size === 1) {
        // Hand back to single-finger panning without a positional jump.
        const remaining = [...pointers.values()][0]
        const rect = viewportRef.current!.getBoundingClientRect()
        panLastRef.current = { x: remaining.x - rect.left, y: remaining.y - rect.top }
        return
      }
      panLastRef.current = null

      const start = tapCandidateRef.current
      tapCandidateRef.current = null
      if (!start || e.type === 'pointercancel') return

      const movedPx = Math.hypot(e.clientX - start.x, e.clientY - start.y)
      const elapsedMs = Date.now() - start.time
      if (movedPx > TAP_MOVE_THRESHOLD_PX || elapsedMs > TAP_MAX_DURATION_MS) return

      const canvas = canvasRef.current
      if (!canvas) return
      // getBoundingClientRect reflects the CSS transform, so this maps the tap
      // through zoom/pan to bitmap pixels without extra math.
      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      const x = Math.floor((e.clientX - rect.left) * scaleX)
      const y = Math.floor((e.clientY - rect.top) * scaleY)

      const regionId = findRegionAtPixel(regionIndex, x, y)
      if (regionId !== undefined) onRegionTap(regionId)
    }

    return (
      <div
        ref={viewportRef}
        className="zoom-viewport"
        style={{ aspectRatio: `${puzzle.width} / ${puzzle.height}`, touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <canvas ref={canvasRef} width={puzzle.width} height={puzzle.height} className="puzzle-canvas" />
        {isZoomed && (
          <button
            className="zoom-reset"
            // Keep the viewport's pointer capture from stealing this button's click.
            onPointerDown={(e) => e.stopPropagation()}
            onClick={resetZoom}
            aria-label="Reset zoom"
          >
            ⤢ 1×
          </button>
        )}
      </div>
    )
  },
)

PuzzleCanvas.displayName = 'PuzzleCanvas'

export default PuzzleCanvas
