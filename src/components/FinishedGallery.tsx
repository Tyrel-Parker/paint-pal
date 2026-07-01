import { useEffect, useState } from 'react'
import type { FinishedWork } from '../types/puzzle'
import { getFinishedWorks } from '../lib/storage'

interface FinishedGalleryProps {
  onExit: () => void
}

export default function FinishedGallery({ onExit }: FinishedGalleryProps) {
  const [works, setWorks] = useState<FinishedWork[] | null>(null)

  useEffect(() => {
    getFinishedWorks().then((all) => setWorks(all.sort((a, b) => b.completedAt - a.completedAt)))
  }, [])

  return (
    <main className="gallery">
      <div className="puzzle-header">
        <button className="back-button" onClick={onExit}>
          ← Back
        </button>
        <h2>Finished Pieces</h2>
        <div className="puzzle-header-actions" />
      </div>
      {works === null ? (
        <p>Loading...</p>
      ) : works.length === 0 ? (
        <p className="empty-state">Nothing finished yet — go paint something!</p>
      ) : (
        <ul className="puzzle-grid">
          {works.map((work) => (
            <li key={work.key}>
              <img src={work.image} alt={work.puzzleName} />
              <p>{work.puzzleName}</p>
              <span className="difficulty-badge">{new Date(work.completedAt).toLocaleDateString()}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
