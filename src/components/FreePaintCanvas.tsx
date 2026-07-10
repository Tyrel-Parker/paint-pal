import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

export interface FreePaintCanvasHandle {
  captureSnapshot(): string
}

export type FreePaintTool = 'brush' | 'eraser'

interface FreePaintCanvasProps {
  outlineSrc: string
  width: number
  height: number
  color: string
  tool: FreePaintTool
  brushSize: number
  initialImage?: string
  onStrokeEnd: (snapshotDataUrl: string) => void
}

/** The page underneath the outline is always white, so erasing just paints white back over it. */
const ERASE_COLOR = '#ffffff'

const MIN_SCALE = 1
const MAX_SCALE = 8
/** Below this, a pinch-out snaps back to exactly 1 so the reset button disappears. */
const SNAP_TO_FIT_SCALE = 1.05
/** A touch finger covers the contact point, so the preview ring floats above it by
 * its own radius plus this clearance instead of sitting directly under the fingertip. */
const TOUCH_PREVIEW_CLEARANCE_PX = 20

interface Transform {
  scale: number
  tx: number
  ty: number
}

type Gesture = 'none' | 'draw' | 'pinch'

function getCanvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY }
}

const FreePaintCanvas = forwardRef<FreePaintCanvasHandle, FreePaintCanvasProps>(
  ({ outlineSrc, width, height, color, tool, brushSize, initialImage, onStrokeEnd }, ref) => {
    const stackRef = useRef<HTMLDivElement>(null)
    const contentRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const outlineImgRef = useRef<HTMLImageElement>(null)
    const previewRef = useRef<HTMLDivElement>(null)
    const colorRef = useRef(color)
    const toolRef = useRef(tool)
    const brushSizeRef = useRef(brushSize)
    const initializedRef = useRef(false)

    // Gesture state (refs: pointer math shouldn't re-render React).
    const pointersRef = useRef(new Map<number, { x: number; y: number }>())
    const gestureRef = useRef<Gesture>('none')
    const drawPointerIdRef = useRef<number | null>(null)
    const lastPointRef = useRef<{ x: number; y: number } | null>(null)
    const transformRef = useRef<Transform>({ scale: 1, tx: 0, ty: 0 })
    const pinchBaselineRef = useRef<{ dist: number; mx: number; my: number } | null>(null)
    const [isZoomed, setIsZoomed] = useState(false)

    colorRef.current = color
    toolRef.current = tool
    brushSizeRef.current = brushSize

    // Blank white page on mount, then draw the resumed paint layer on top if one exists.
    // Only ever applied once — after that, in-memory canvas state is the source of truth.
    useEffect(() => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx || initializedRef.current) return
      initializedRef.current = true

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)

      if (initialImage) {
        const img = new Image()
        img.onload = () => ctx.drawImage(img, 0, 0, width, height)
        img.src = initialImage
      }
    }, [width, height, initialImage])

    useImperativeHandle(ref, () => ({
      captureSnapshot() {
        const canvas = canvasRef.current
        const outlineImg = outlineImgRef.current
        if (!canvas) return ''

        const composite = document.createElement('canvas')
        composite.width = width
        composite.height = height
        const ctx = composite.getContext('2d')
        if (!ctx) return ''
        ctx.drawImage(canvas, 0, 0)
        if (outlineImg?.complete) ctx.drawImage(outlineImg, 0, 0, width, height)
        return composite.toDataURL('image/png')
      },
    }))

    function paintDot(ctx: CanvasRenderingContext2D, x: number, y: number) {
      ctx.fillStyle = toolRef.current === 'eraser' ? ERASE_COLOR : colorRef.current
      ctx.beginPath()
      ctx.arc(x, y, brushSizeRef.current / 2, 0, Math.PI * 2)
      ctx.fill()
    }

    function paintLine(ctx: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }) {
      ctx.strokeStyle = toolRef.current === 'eraser' ? ERASE_COLOR : colorRef.current
      ctx.lineWidth = brushSizeRef.current
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.stroke()
    }

    /** Moves/resizes/shows the brush-edge ring, offsetting it above a touch fingertip so it isn't hidden. */
    function updatePreview(clientX: number, clientY: number, pointerType: string) {
      const preview = previewRef.current
      const canvas = canvasRef.current
      const stack = stackRef.current
      if (!preview || !canvas || !stack) return

      const canvasRect = canvas.getBoundingClientRect()
      const stackRect = stack.getBoundingClientRect()
      const scaleX = canvasRect.width / canvas.width
      const diameter = Math.max(brushSizeRef.current * scaleX, 4)
      const offsetY = pointerType === 'touch' ? -(diameter / 2 + TOUCH_PREVIEW_CLEARANCE_PX) : 0
      const x = clientX - stackRect.left
      const y = clientY - stackRect.top + offsetY

      preview.style.width = `${diameter}px`
      preview.style.height = `${diameter}px`
      preview.style.transform = `translate(${x - diameter / 2}px, ${y - diameter / 2}px)`
      preview.style.borderColor = toolRef.current === 'eraser' ? 'rgba(90,90,90,0.85)' : colorRef.current
      preview.style.opacity = '1'
    }

    function hidePreview() {
      const preview = previewRef.current
      if (preview) preview.style.opacity = '0'
    }

    function applyTransform(next: Transform) {
      const stack = stackRef.current
      const content = contentRef.current
      if (!stack || !content) return

      const vw = stack.clientWidth
      const vh = stack.clientHeight
      let { scale, tx, ty } = next
      scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
      if (scale < SNAP_TO_FIT_SCALE) {
        scale = 1
        tx = 0
        ty = 0
      }
      // Keep the (scaled) content covering the viewport — no white gaps.
      tx = Math.min(0, Math.max(vw - vw * scale, tx))
      ty = Math.min(0, Math.max(vh - vh * scale, ty))

      transformRef.current = { scale, tx, ty }
      content.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`
      setIsZoomed(scale > 1)
    }

    function resetZoom() {
      applyTransform({ scale: 1, tx: 0, ty: 0 })
    }

    useEffect(() => {
      resetZoom()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    function finishDrawStroke() {
      gestureRef.current = 'none'
      drawPointerIdRef.current = null
      lastPointRef.current = null
      const canvas = canvasRef.current
      if (canvas) onStrokeEnd(canvas.toDataURL('image/png'))
    }

    function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
      const stack = stackRef.current
      if (!stack) return
      try {
        stack.setPointerCapture(e.pointerId)
      } catch {
        // Non-capturable pointer (synthetic/stale id) — gesture tracking still works.
      }
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

      if (gestureRef.current === 'none' && pointersRef.current.size === 1) {
        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d')
        if (!canvas || !ctx) return
        gestureRef.current = 'draw'
        drawPointerIdRef.current = e.pointerId
        const point = getCanvasPoint(canvas, e.clientX, e.clientY)
        lastPointRef.current = point
        paintDot(ctx, point.x, point.y)
        updatePreview(e.clientX, e.clientY, e.pointerType)
        return
      }

      if (pointersRef.current.size === 2) {
        if (gestureRef.current === 'draw') finishDrawStroke()
        gestureRef.current = 'pinch'
        hidePreview()
        const [a, b] = [...pointersRef.current.values()]
        const rect = stack.getBoundingClientRect()
        pinchBaselineRef.current = {
          dist: Math.hypot(a.x - b.x, a.y - b.y),
          mx: (a.x + b.x) / 2 - rect.left,
          my: (a.y + b.y) / 2 - rect.top,
        }
      }
    }

    function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
      const stack = stackRef.current
      if (!stack) return
      if (pointersRef.current.has(e.pointerId)) {
        pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      }

      if (gestureRef.current === 'draw' && e.pointerId === drawPointerIdRef.current) {
        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d')
        if (canvas && ctx && lastPointRef.current) {
          const point = getCanvasPoint(canvas, e.clientX, e.clientY)
          paintLine(ctx, lastPointRef.current, point)
          lastPointRef.current = point
        }
        updatePreview(e.clientX, e.clientY, e.pointerType)
        return
      }

      if (gestureRef.current === 'pinch' && pointersRef.current.size === 2 && pinchBaselineRef.current) {
        const [a, b] = [...pointersRef.current.values()]
        const rect = stack.getBoundingClientRect()
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

      // Hover preview for mouse/pen when idle (touch has no hover state to show it in).
      if (gestureRef.current === 'none' && e.pointerType !== 'touch') {
        updatePreview(e.clientX, e.clientY, e.pointerType)
      }
    }

    function endGesture(e: React.PointerEvent<HTMLDivElement>) {
      pointersRef.current.delete(e.pointerId)

      if (gestureRef.current === 'draw' && e.pointerId === drawPointerIdRef.current) {
        finishDrawStroke()
        if (e.pointerType === 'touch') hidePreview()
        return
      }

      if (gestureRef.current === 'pinch') {
        pinchBaselineRef.current = null
        if (pointersRef.current.size < 2) gestureRef.current = 'none'
      }
    }

    function handlePointerLeave() {
      if (gestureRef.current === 'none') hidePreview()
    }

    return (
      <div
        ref={stackRef}
        className="free-paint-stack"
        style={{ aspectRatio: `${width} / ${height}`, touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onPointerLeave={handlePointerLeave}
      >
        <div ref={contentRef} className="free-paint-content">
          <canvas ref={canvasRef} width={width} height={height} className="free-paint-canvas" />
          <img ref={outlineImgRef} src={outlineSrc} alt="" className="free-paint-outline" />
        </div>
        <div ref={previewRef} className="free-paint-brush-preview" />
        {isZoomed && (
          <button
            className="zoom-reset"
            // Keep the stack's pointer capture from stealing this button's click.
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

FreePaintCanvas.displayName = 'FreePaintCanvas'

export default FreePaintCanvas
