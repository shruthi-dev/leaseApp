import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { leaseTitle, type Lease } from '../lib/leases'
import { currentMonthlyRent, dashboardState } from '../lib/portfolio'
import { formatDate, formatMoney } from '../lib/format'
import { useElementWidth } from '../lib/useElementWidth'
import { stateLabel } from './PortfolioStatusBar'
import { t } from '../i18n'

const MAX_ROWS = 12
const ROW_H = 30
const BAR_H = 14
const AXIS_H = 26
const DAY = 86_400_000

const time = (iso: string) => new Date(`${iso}T00:00:00`).getTime()

/**
 * Gantt-style view of the portfolio: one bar per lease from commencement to expiration, colored
 * by state (not-started leases are outlined), with a line for today. Hover or focus a row for
 * details; click to open the lease.
 */
export function LeaseTimeline({ leases, today }: { leases: Lease[]; today: string }) {
  const navigate = useNavigate()
  const wrap = useRef<HTMLDivElement>(null)
  const width = useElementWidth(wrap)
  const [active, setActive] = useState<number | null>(null)

  const dated = useMemo(
    () =>
      leases
        .filter((l) => l.commencement_date && l.expiration_date && l.expiration_date >= l.commencement_date)
        .sort((a, b) => a.expiration_date!.localeCompare(b.expiration_date!)),
    [leases],
  )
  const rows = dated.slice(0, MAX_ROWS)
  if (rows.length === 0) return <p className="empty muted">{t('dashboard.timelineEmpty')}</p>

  // Whole years from the earliest start to the latest end, always including today.
  const now = time(today)
  const firstYear = Math.min(...rows.map((l) => Number(l.commencement_date!.slice(0, 4))), Number(today.slice(0, 4)))
  const lastYear = Math.max(...rows.map((l) => Number(l.expiration_date!.slice(0, 4))), Number(today.slice(0, 4))) + 1
  const min = time(`${firstYear}-01-01`)
  const max = time(`${lastYear}-01-01`)
  const labelW = width < 560 ? 104 : 180
  const plotX = labelW + 8
  const plotW = Math.max(80, width - plotX - 12)
  const x = (ms: number) => plotX + ((ms - min) / (max - min)) * plotW
  // Room below the rows for the Today label, so it never sits on a bar.
  const rowsBottom = AXIS_H + rows.length * ROW_H
  const height = rowsBottom + 22
  const span = lastYear - firstYear
  // Year labels need ~44px each: on narrow screens show every 2nd, 4th, 5th or 10th year.
  const step = [1, 2, 4, 5, 10].find((n) => (plotW / span) * n >= 44) ?? 10
  const years: number[] = []
  for (let y = firstYear; y <= lastYear; y += step) years.push(y)
  const maxChars = Math.floor(labelW / 7)
  const clip = (s: string) => (s.length > maxChars ? `${s.slice(0, maxChars - 1)}…` : s)
  const hovered = active !== null ? rows[active] : null

  return (
    <div className="chart timeline" ref={wrap}>
      <svg width={width} height={height} role="img" aria-label={t('dashboard.timelineTitle')}>
        {years.map((y) => (
          <g key={y}>
            <line className="chart-grid" x1={x(time(`${y}-01-01`))} x2={x(time(`${y}-01-01`))} y1={AXIS_H - 6} y2={rowsBottom} />
            <text className="chart-tick" x={x(time(`${y}-01-01`)) + 3} y={AXIS_H - 12}>
              {y}
            </text>
          </g>
        ))}

        {rows.map((l, i) => {
          const state = dashboardState(l, today)
          const y = AXIS_H + i * ROW_H
          const x1 = x(time(l.commencement_date!))
          const x2 = Math.max(x1 + 3, x(time(l.expiration_date!) + DAY))
          return (
            <g key={l.id} className={active === i ? 'timeline-row active' : 'timeline-row'}>
              <text className="timeline-label" x={labelW} y={y + ROW_H / 2} dy="0.35em" textAnchor="end">
                {clip(leaseTitle(l))}
              </text>
              <rect
                className={`timeline-bar state-${state}`}
                x={x1}
                y={y + (ROW_H - BAR_H) / 2}
                width={x2 - x1}
                height={BAR_H}
                rx={3}
              />
              <rect
                className="chart-hit"
                x={0}
                y={y}
                width={width}
                height={ROW_H}
                tabIndex={0}
                role="link"
                aria-label={`${leaseTitle(l)}: ${stateLabel(state)}, ${formatDate(l.commencement_date)} – ${formatDate(l.expiration_date)}`}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                onClick={() => navigate(`/leases/${l.id}`)}
                onKeyDown={(e) => e.key === 'Enter' && navigate(`/leases/${l.id}`)}
              />
            </g>
          )
        })}

        {now >= min && now <= max && (
          <g className="today-marker">
            <line x1={x(now)} x2={x(now)} y1={AXIS_H - 6} y2={rowsBottom + 4} />
            <text x={x(now)} y={height - 4} textAnchor="middle">
              {t('dashboard.todayMarker')}
            </text>
          </g>
        )}
      </svg>

      {hovered && active !== null && (
        <div
          className="chart-tooltip"
          role="status"
          style={{
            // Centered over the hovered bar, kept inside the chart.
            left: Math.min(
              Math.max(plotX, (x(time(hovered.commencement_date!)) + x(time(hovered.expiration_date!))) / 2 - 110),
              Math.max(plotX, width - 230),
            ),
            top: AXIS_H + active * ROW_H + ROW_H,
          }}
        >
          <strong>{leaseTitle(hovered)}</strong>
          <span>{stateLabel(dashboardState(hovered, today))}</span>
          <span className="muted">
            {formatDate(hovered.commencement_date)} – {formatDate(hovered.expiration_date)}
          </span>
          {currentMonthlyRent(hovered, today) !== null && (
            <span className="muted">
              {t('dashboard.perMonth', { amount: formatMoney(currentMonthlyRent(hovered, today), hovered.currency) })}
            </span>
          )}
        </div>
      )}

      {(dated.length > rows.length || leases.length > dated.length) && (
        <p className="muted small chart-note">
          {dated.length > rows.length && t('dashboard.timelineMore', { shown: rows.length, total: dated.length })}
          {dated.length > rows.length && leases.length > dated.length && ' · '}
          {leases.length > dated.length && t('dashboard.timelineMissingDates', { count: leases.length - dated.length })}
        </p>
      )}

      <details className="chart-table">
        <summary>{t('dashboard.showTable')}</summary>
        <table className="data-table compact">
          <thead>
            <tr>
              <th>{t('columns.lease')}</th>
              <th>{t('columns.term')}</th>
              <th>{t('columns.status')}</th>
            </tr>
          </thead>
          <tbody>
            {dated.map((l) => (
              <tr key={l.id}>
                <td>{leaseTitle(l)}</td>
                <td>
                  {formatDate(l.commencement_date)} – {formatDate(l.expiration_date)}
                </td>
                <td>{stateLabel(dashboardState(l, today))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
