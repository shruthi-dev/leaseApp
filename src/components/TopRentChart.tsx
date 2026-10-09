import { Link } from 'react-router-dom'
import { leaseTitle, type Lease } from '../lib/leases'
import { currentMonthlyRent, dashboardState, DEFAULT_CURRENCY } from '../lib/portfolio'
import { formatMoney } from '../lib/format'
import { t } from '../i18n'

const LIMIT = 8

/**
 * Horizontal bars of current monthly rent for live leases (active, expiring, not started), one
 * currency only so bar lengths are comparable. Values are labelled directly at the bar ends.
 */
export function TopRentChart({ leases, today }: { leases: Lease[]; today: string }) {
  const live = leases
    .filter((l) => ['active', 'expiring', 'upcoming'].includes(dashboardState(l, today)))
    .map((l) => ({ lease: l, rent: currentMonthlyRent(l, today), currency: l.currency ?? DEFAULT_CURRENCY }))
    .filter((r): r is { lease: Lease; rent: number; currency: string } => r.rent !== null && r.rent > 0)

  if (live.length === 0) return <p className="empty muted">{t('dashboard.topRentEmpty')}</p>

  // The most common currency; leases in others are counted in a note.
  const byCurrency = new Map<string, number>()
  live.forEach((r) => byCurrency.set(r.currency, (byCurrency.get(r.currency) ?? 0) + 1))
  const currency = [...byCurrency.entries()].sort((a, b) => b[1] - a[1])[0][0]
  const rows = live.filter((r) => r.currency === currency).sort((a, b) => b.rent - a.rent)
  const shown = rows.slice(0, LIMIT)
  const max = shown[0].rent
  const others = live.length - rows.length

  return (
    <div className="hbar-chart">
      <ul>
        {shown.map(({ lease, rent }) => (
          <li key={lease.id} className="hbar-row">
            <Link to={`/leases/${lease.id}`} className="hbar-label" title={leaseTitle(lease)}>
              {leaseTitle(lease)}
            </Link>
            <span className="hbar-track">
              <span className="hbar-bar" style={{ width: `${Math.max(2, (rent / max) * 100)}%` }} />
              <span className="hbar-value">{formatMoney(rent, currency)}</span>
            </span>
          </li>
        ))}
      </ul>
      {(rows.length > shown.length || others > 0) && (
        <p className="muted small chart-note">
          {rows.length > shown.length && t('dashboard.timelineMore', { shown: shown.length, total: rows.length })}
          {rows.length > shown.length && others > 0 && ' · '}
          {others > 0 && t('dashboard.topRentOtherCurrency', { count: others })}
        </p>
      )}
    </div>
  )
}
