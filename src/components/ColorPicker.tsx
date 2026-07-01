import { PRESET_COLORS } from '../lib/colorPresets'

interface ColorPickerProps {
  value: string
  onChange: (hex: string) => void
}

export default function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="color-picker">
      <ul className="color-preset-list">
        {PRESET_COLORS.map((hex) => (
          <li key={hex}>
            <button
              className={`color-preset${hex === value ? ' selected' : ''}`}
              style={{ backgroundColor: hex }}
              aria-label={`Select color ${hex}`}
              onClick={() => onChange(hex)}
            />
          </li>
        ))}
        <li>
          <label className="color-preset color-preset-more" style={{ backgroundColor: value }}>
            <span>+</span>
            <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Pick a custom color" />
          </label>
        </li>
      </ul>
    </div>
  )
}
