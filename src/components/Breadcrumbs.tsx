export interface Crumb {
  label: string
  /** Absent on the last (current) crumb. */
  onTap?: () => void
}

/** Path-style navigation (Gallery › Cat › Easy) so any level is one tap away. */
export default function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav className="breadcrumbs" aria-label="Navigation path">
      {crumbs.map((crumb, i) => (
        <span key={i} className="breadcrumb-item">
          {i > 0 && <span className="breadcrumb-sep">›</span>}
          {crumb.onTap ? (
            <button className="breadcrumb-link" onClick={crumb.onTap}>
              {crumb.label}
            </button>
          ) : (
            <span className="breadcrumb-current">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
