import type { FinishedWork } from '../types/puzzle'
import Breadcrumbs, { type Crumb } from './Breadcrumbs'

interface ArtworkViewerProps {
  work: FinishedWork
  crumbs: Crumb[]
  /** Shown right after finishing a piece: adds the celebration banner. */
  celebrate?: boolean
}

/** Full-size display of a finished piece; doubles as the post-finish celebration screen. */
export default function ArtworkViewer({ work, crumbs, celebrate = false }: ArtworkViewerProps) {
  return (
    <main className="puzzle-screen artwork-viewer">
      <Breadcrumbs crumbs={crumbs} />
      {celebrate && <h2 className="celebrate-banner">🎉 You did it! 🎉</h2>}
      <img src={work.image} alt={work.puzzleName} />
      <p className="artwork-caption">
        <strong>{work.puzzleName}</strong>
        <span className="difficulty-badge"> · {new Date(work.completedAt).toLocaleDateString()}</span>
      </p>
    </main>
  )
}
