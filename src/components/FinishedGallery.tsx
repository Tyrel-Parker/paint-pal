import { useEffect, useState } from 'react'
import type { FinishedWork } from '../types/puzzle'
import { getFinishedWorks } from '../lib/storage'
import Breadcrumbs from './Breadcrumbs'

interface FinishedGalleryProps {
  onExit: () => void
  onSelectWork: (work: FinishedWork) => void
}

export default function FinishedGallery({ onExit, onSelectWork }: FinishedGalleryProps) {
  const [works, setWorks] = useState<FinishedWork[] | null>(null)

  useEffect(() => {
    getFinishedWorks().then((all) => setWorks(all.sort((a, b) => b.completedAt - a.completedAt)))
  }, [])

  return (
    <main className="gallery">
      <div className="puzzle-header">
        <Breadcrumbs crumbs={[{ label: '🏠 Gallery', onTap: onExit }, { label: '🖼️ Finished' }]} />
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
              <button className="puzzle-card" onClick={() => onSelectWork(work)}>
                <img src={work.image} alt={work.puzzleName} />
                <p>{work.puzzleName}</p>
                <span className="difficulty-badge">{new Date(work.completedAt).toLocaleDateString()}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
