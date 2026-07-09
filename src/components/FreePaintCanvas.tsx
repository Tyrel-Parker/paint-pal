import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

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

function getCanvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY }
}

const FreePaintCanvas = forwardRef<FreePaintCanvasHandle, FreePaintCanvasProps>(
  ({ outlineSrc, width, height, color, tool, brushSize, initialImage, onStrokeEnd }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const outlineImgRef = useRef<HTMLImageElement>(null)
    const colorRef = useRef(color)
    const toolRef = useRef(tool)
    const brushSizeRef = useRef(brushSize)
    const isDrawingRef = useRef(false)
    const lastPointRef = useRef<{ x: number; y: number } | null>(null)
    const initializedRef = useRef(false)

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

    function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return
      const point = getCanvasPoint(canvas, e.clientX, e.clientY)
      isDrawingRef.current = true
      lastPointRef.current = point
      paintDot(ctx, point.x, point.y)
    }

    function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
      if (!isDrawingRef.current) return
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return
      const point = getCanvasPoint(canvas, e.clientX, e.clientY)
      if (lastPointRef.current) paintLine(ctx, lastPointRef.current, point)
      lastPointRef.current = point
    }

    function endStroke() {
      if (!isDrawingRef.current) return
      isDrawingRef.current = false
      lastPointRef.current = null
      const canvas = canvasRef.current
      if (canvas) onStrokeEnd(canvas.toDataURL('image/png'))
    }

    return (
      <div className="free-paint-stack" style={{ aspectRatio: `${width} / ${height}` }}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="free-paint-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endStroke}
          onPointerLeave={endStroke}
        />
        <img ref={outlineImgRef} src={outlineSrc} alt="" className="free-paint-outline" />
      </div>
    )
  },
)

FreePaintCanvas.displayName = 'FreePaintCanvas'

export default FreePaintCanvas
