import type { PaintMode, Puzzle } from '../types/puzzle'

interface GalleryProps {
  puzzles: Puzzle[]
  loading: boolean
  onPlay: (puzzleId: string, mode: PaintMode) => void
  onShowFinished: () => void
}

export default function Gallery({ puzzles, loading, onPlay, onShowFinished }: GalleryProps) {
  return (
    <main className="gallery">
      <div className="puzzle-header">
        <h1>PaintPal</h1>
        <button onClick={onShowFinished}>🖼️ Finished</button>
      </div>
      {loading ? (
        <p>Loading puzzles...</p>
      ) : puzzles.length === 0 ? (
        <p className="empty-state">
          No puzzles yet. Drop images into <code>source-images/</code> and run{' '}
          <code>npm run preprocess</code>, or add your own from the app once that's built.
        </p>
      ) : (
        <ul className="puzzle-grid">
          {puzzles.map((puzzle) => (
            <li key={puzzle.id}>
              <img src={puzzle.thumbnail} alt={puzzle.name} />
              <p>{puzzle.name}</p>
              <span className="difficulty-badge">{puzzle.difficulty}</span>
              <div className="puzzle-card-actions">
                <button onClick={() => onPlay(puzzle.id, 'numbers')}>Paint by Number</button>
                <button onClick={() => onPlay(puzzle.id, 'free')}>Free Paint</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
