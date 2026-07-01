import type { PuzzleGroup } from '../lib/puzzleGroups'

interface GalleryProps {
  groups: PuzzleGroup[]
  loading: boolean
  onSelectImage: (groupKey: string) => void
  onShowFinished: () => void
}

export default function Gallery({ groups, loading, onSelectImage, onShowFinished }: GalleryProps) {
  return (
    <main className="gallery">
      <div className="puzzle-header">
        <h1>PaintPal</h1>
        <button onClick={onShowFinished}>🖼️ Finished</button>
      </div>
      {loading ? (
        <p>Loading puzzles...</p>
      ) : groups.length === 0 ? (
        <p className="empty-state">
          No puzzles yet. Drop images into <code>source-images/</code> and run{' '}
          <code>npm run preprocess</code>, or add your own from the app once that's built.
        </p>
      ) : (
        <ul className="puzzle-grid">
          {groups.map((group) => (
            <li key={group.key}>
              <button className="puzzle-card" onClick={() => onSelectImage(group.key)}>
                <img src={group.thumbnail} alt={group.name} />
                <p>{group.name}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
