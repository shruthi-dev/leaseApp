import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface Props {
  label: string
  value: string
  hint?: ReactNode
  /** Makes the whole tile a link to the detail view. */
  to?: string
}

export function StatTile({ label, value, hint, to }: Props) {
  const body = (
    <>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </>
  )
  return to ? (
    <Link to={to} className="card stat-tile stat-link">
      {body}
    </Link>
  ) : (
    <div className="card stat-tile">{body}</div>
  )
}
