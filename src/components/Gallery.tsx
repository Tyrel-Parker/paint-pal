import { useRef } from 'react'
import type { PuzzleGroup } from '../lib/puzzleGroups'

interface GalleryProps {
  groups: PuzzleGroup[]
  loading: boolean
  onSelectImage: (groupKey: string) => void
  onShowFinished: () => void
  onAddPhoto: (file: File) => void
  onDeleteGroup: (group: PuzzleGroup) => void
}

export default function Gallery({
  groups,
  loading,
  onSelectImage,
  onShowFinished,
  onAddPhoto,
  onDeleteGroup,
}: GalleryProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onAddPhoto(file)
    e.target.value = '' // allow re-picking the same file later
  }

  function handleDelete(e: React.MouseEvent, group: PuzzleGroup) {
    e.stopPropagation()
    if (confirm(`Delete "${group.name}" and its saved painting progress?`)) onDeleteGroup(group)
  }

  return (
    <main className="gallery">
      <div className="puzzle-header">
        <h1>PaintPal</h1>
        <button onClick={onShowFinished}>🖼️ Finished</button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleFileChange}
      />
      {loading ? (
        <p>Loading puzzles...</p>
      ) : (
        <ul className="puzzle-grid">
          <li>
            <button className="puzzle-card add-photo-card" onClick={() => fileInputRef.current?.click()}>
              <span className="add-photo-plus">＋</span>
              <p>Add your photo</p>
            </button>
          </li>
          {groups.map((group) => (
            <li key={group.key} className="puzzle-card-cell">
              <button className="puzzle-card" onClick={() => onSelectImage(group.key)}>
                <img src={group.thumbnail} alt={group.name} />
                <p>{group.name}</p>
              </button>
              {group.source === 'user' && (
                <button
                  className="puzzle-card-delete"
                  aria-label={`Delete ${group.name}`}
                  onClick={(e) => handleDelete(e, group)}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
