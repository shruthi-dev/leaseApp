import { useRef, useState } from 'react'
import type { MonthBucket } from '../lib/portfolio'
import { formatMonth } from '../lib/format'
import { useElementWidth } from '../lib/useElementWidth'
import { t } from '../i18n'

const HEIGHT = 230
const MARGIN = { top: 22, right: 8, bottom: 40, left: 30 }
const MAX_BAR = 24
const RADIUS = 4
const TOOLTIP_NAMES = 3

/** Bar path with a rounded data-end and a square baseline. */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(RADIUS, h, w / 2)
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
}

/** Integer y-axis ticks: 0 … top, at most ~4 steps. */
function ticks(max: number): number[] {
  const step = Math.max(1, Math.ceil(max / 4))
  const top = Math.max(step, Math.ceil(max / step) * step)
  return Array.from({ length: top / step + 1 }, (_, i) => i * step)
}

const leaseName = (l: MonthBucket['leases'][number]) => l.tenant ?? l.file_name

/** mode 'month': buckets are months (labels like Oct, with the year on January); 'year': buckets are years. */
export function ExpirationChart({ buckets, mode = 'month' }: { buckets: MonthBucket[]; mode?: 'month' | 'year' }) {
  const short = (b: MonthBucket) => (mode === 'year' ? b.key : formatMonth(b.start))
  const long = (b: MonthBucket) => (mode === 'year' ? b.key : formatMonth(b.start, 'long'))
  const wrap = useRef<HTMLDivElement>(null)
  const width = useElementWidth(wrap)
  const [active, setActive] = useState<number | null>(null)

  const counts = buckets.map((b) => b.leases.length)
  const yTicks = ticks(Math.max(...counts, 1))
  const yMax = yTicks[yTicks.length - 1]
  const plotW = width - MARGIN.left - MARGIN.right
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom
  const band = plotW / buckets.length
  const barW = Math.min(MAX_BAR, band * 0.6)
  const y = (v: number) => MARGIN.top + plotH - (v / yMax) * plotH
  const hovered = active !== null ? buckets[active] : null

  return (
    <div className="chart" ref={wrap}>
      <svg width={width} height={HEIGHT} role="img" aria-label={t('dashboard.chartTitle')}>
        {yTicks.map((v) => (
          <g key={v}>
            <line className="chart-grid" x1={MARGIN.left} x2={width - MARGIN.right} y1={y(v)} y2={y(v)} />
            <text className="chart-tick" x={MARGIN.left - 8} y={y(v)} dy="0.32em" textAnchor="end">
              {v}
            </text>
          </g>
        ))}

        {buckets.map((b, i) => {
          const cx = MARGIN.left + band * i + band / 2
          const count = b.leases.length
          const month = Number(b.start.slice(5, 7))
          const showYear = mode === 'month' && (i === 0 || month === 1)
          return (
            <g key={b.key} className={active === i ? 'bar-group active' : 'bar-group'}>
              {count > 0 && (
                <>
                  <path className="chart-bar" d={barPath(cx - barW / 2, y(count), barW, y(0) - y(count))} />
                  <text className="chart-value" x={cx} y={y(count) - 6} textAnchor="middle">
                    {count}
                  </text>
                </>
              )}
              <text className="chart-tick" x={cx} y={HEIGHT - MARGIN.bottom + 16} textAnchor="middle">
                {short(b)}
              </text>
              {showYear && (
                <text className="chart-tick chart-year" x={cx} y={HEIGHT - MARGIN.bottom + 30} textAnchor="middle">
                  {b.start.slice(0, 4)}
                </text>
              )}
              {/* Hit target: the whole column, bigger than the bar. Keyboard-focusable. */}
              <rect
                className="chart-hit"
                x={cx - band / 2}
                y={MARGIN.top}
                width={band}
                height={plotH}
                tabIndex={0}
                aria-label={`${long(b)}: ${count === 1 ? t('dashboard.chartTooltipOne') : t('dashboard.chartTooltip', { count })}`}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              />
            </g>
          )
        })}
        <line className="chart-axis" x1={MARGIN.left} x2={width - MARGIN.right} y1={y(0)} y2={y(0)} />
      </svg>

      {hovered && active !== null && (
        <div
          // Beside the bar (flipping left near the right edge) so it never covers the title or the bar.
          className={`chart-tooltip ${MARGIN.left + band * (active + 0.5) > width - 240 ? 'flip' : ''}`}
          role="status"
          style={{
            left: MARGIN.left + band * (active + 0.5) + (MARGIN.left + band * (active + 0.5) > width - 240 ? -barW : barW),
            top: Math.min(y(hovered.leases.length), y(0) - 40),
          }}
        >
          <strong>
            {hovered.leases.length === 1
              ? t('dashboard.chartTooltipOne')
              : t('dashboard.chartTooltip', { count: hovered.leases.length })}
          </strong>
          <span className="muted">{long(hovered)}</span>
          {hovered.leases.slice(0, TOOLTIP_NAMES).map((l) => (
            <span key={l.id} className="chart-tooltip-name">
              {leaseName(l)}
            </span>
          ))}
          {hovered.leases.length > TOOLTIP_NAMES && (
            <span className="muted">{t('dashboard.andMore', { count: hovered.leases.length - TOOLTIP_NAMES })}</span>
          )}
        </div>
      )}

      <details className="chart-table">
        <summary>{t('dashboard.showTable')}</summary>
        <table className="data-table compact">
          <thead>
            <tr>
              <th>{t('dashboard.tableMonth')}</th>
              <th className="num">{t('dashboard.tableCount')}</th>
              <th>{t('dashboard.tableTenants')}</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.key}>
                <td>{long(b)}</td>
                <td className="num">{b.leases.length}</td>
                <td>{b.leases.map(leaseName).join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
