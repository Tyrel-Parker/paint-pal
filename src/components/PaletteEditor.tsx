import type { Palette } from '../types/puzzle'

interface PaletteEditorProps {
  palette: Palette
  onChange: (palette: Palette) => void
  onDone: () => void
}

export default function PaletteEditor({ palette, onChange, onDone }: PaletteEditorProps) {
  const entries = Object.entries(palette)
    .map(([number, hex]) => [Number(number), hex] as const)
    .sort((a, b) => a[0] - b[0])

  function setColor(colorNumber: number, hex: string) {
    onChange({ ...palette, [colorNumber]: hex })
  }

  return (
    <div className="palette-editor">
      <h2>Pick your colors</h2>
      <p className="palette-editor-hint">Tap a swatch to change its color, then start painting.</p>
      <ul className="palette-swatch-list">
        {entries.map(([colorNumber, hex]) => (
          <li key={colorNumber}>
            <label className="palette-swatch" style={{ backgroundColor: hex }}>
              <span>{colorNumber}</span>
              <input
                type="color"
                value={hex}
                onChange={(e) => setColor(colorNumber, e.target.value)}
                aria-label={`Color ${colorNumber}`}
              />
            </label>
          </li>
        ))}
      </ul>
      <button className="primary-button" onClick={onDone}>
        Start Painting
      </button>
    </div>
  )
}
