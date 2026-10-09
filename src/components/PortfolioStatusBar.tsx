import type { DashboardState } from '../lib/portfolio'
import { t, type MessageKey } from '../i18n'

/** Display order: live leases first, then the ones that need no action. */
export const STATE_ORDER: DashboardState[] = ['active', 'expiring', 'upcoming', 'expired', 'undated']

export const stateLabel = (s: DashboardState) => t(`dashboard.state.${s}` as MessageKey)

/**
 * One stacked bar splitting all analyzed leases by state, with a legend that repeats every count
 * and share as text (color never carries the meaning alone).
 */
export function PortfolioStatusBar({ counts }: { counts: Record<DashboardState, number> }) {
  const total = STATE_ORDER.reduce((sum, s) => sum + counts[s], 0)
  if (total === 0) return null
  const pct = (n: number) => Math.round((n / total) * 100)
  const shown = STATE_ORDER.filter((s) => counts[s] > 0)

  return (
    <div className="status-breakdown">
      <div className="stack-bar" role="img" aria-label={shown.map((s) => `${stateLabel(s)}: ${counts[s]}`).join(', ')}>
        {shown.map((s) => (
          <span
            key={s}
            className={`stack-seg state-${s}`}
            style={{ flexGrow: counts[s] }}
            title={`${stateLabel(s)}: ${counts[s]} (${pct(counts[s])}%)`}
          />
        ))}
      </div>
      <ul className="state-legend">
        {shown.map((s) => (
          <li key={s}>
            <span className={`swatch state-${s}`} aria-hidden="true" />
            <span className="legend-label">{stateLabel(s)}</span>
            <span className="legend-value">
              <strong>{counts[s]}</strong> <span className="muted">· {pct(counts[s])}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
