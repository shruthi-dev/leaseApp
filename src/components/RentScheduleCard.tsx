import type { Lease } from '../lib/leases'
import { currentPeriod, hasRentSchedule, monthlyOf, type RentPeriod } from '../lib/rentSchedule'
import { amendmentTitle } from '../lib/amendments'
import { formatDate, formatMoney } from '../lib/format'
import { t } from '../i18n'

/**
 * The lease's base rent schedule as a table, when the document lists one. `lease` is the lease
 * with amendments applied, so an amendment's new schedule replaces the original.
 */
export function RentScheduleCard({ lease, today }: { lease: Lease; today: string }) {
  if (!hasRentSchedule(lease.rent_schedule)) return null
  const rows = lease.rent_schedule
  const amended = lease.amended?.rent_schedule
  const current = currentPeriod(rows, today)
  const showSqft = rows.some((r) => r.rent_per_sqft !== null)
  const showNotes = rows.some((r) => r.note)
  const money = (n: number | null) => formatMoney(n, lease.currency)
  // Grey amounts are computed from the other figure; explain them only when there are some.
  const anyCalculated = rows.some(
    (r) => (r.monthly_rent === null && r.annual_rent !== null) || (r.annual_rent === null && r.monthly_rent !== null),
  )

  const period = (r: RentPeriod) =>
    r.start_date || r.end_date
      ? `${formatDate(r.start_date)} – ${r.end_date ? formatDate(r.end_date) : t('rentSchedule.onwards')}`
      : (r.period_label ?? '—')

  return (
    <div className="card rent-schedule-card">
      <div className="card-head-row">
        <div>
          <h2>
            {t('rentSchedule.title')}
            {amended && (
              <span className="badge badge-info tag" title={amendmentTitle(amended.amendment)}>
                {t('amendments.amended')}
              </span>
            )}
          </h2>
          <p className="muted small">
            {amended
              ? t('rentSchedule.fromAmendment', { amendment: amendmentTitle(amended.amendment) })
              : t('rentSchedule.hint')}
          </p>
        </div>
      </div>
      <table className="data-table responsive-table schedule-table">
        <thead>
          <tr>
            <th>{t('rentSchedule.period')}</th>
            <th className="num">{t('rentSchedule.monthly')}</th>
            <th className="num">{t('rentSchedule.annual')}</th>
            {showSqft && <th className="num">{t('rentSchedule.perSqft')}</th>}
            {showNotes && <th>{t('rentSchedule.note')}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isCurrent = r === current
            return (
              <tr key={i} className={isCurrent ? 'current-period' : undefined}>
                <td className="cell-primary">
                  <div className="period-cell">
                    <span>{period(r)}</span>
                    {isCurrent && <span className="badge badge-success">{t('rentSchedule.current')}</span>}
                  </div>
                  {r.period_label && (r.start_date || r.end_date) && !restatesDates(r.period_label) && (
                    <div className="muted small">{r.period_label}</div>
                  )}
                </td>
                <td className="num nowrap" data-label={t('rentSchedule.monthly')}>
                  {r.monthly_rent !== null ? money(r.monthly_rent) : <span className="muted">{money(monthlyOf(r))}</span>}
                </td>
                <td className="num nowrap" data-label={t('rentSchedule.annual')}>
                  {r.annual_rent !== null ? (
                    money(r.annual_rent)
                  ) : (
                    <span className="muted">{money(r.monthly_rent !== null ? r.monthly_rent * 12 : null)}</span>
                  )}
                </td>
                {showSqft && (
                  <td className="num nowrap" data-label={t('rentSchedule.perSqft')}>
                    {r.rent_per_sqft !== null ? money(r.rent_per_sqft) : '—'}
                  </td>
                )}
                {showNotes && (
                  <td data-label={t('rentSchedule.note')}>{r.note ?? <span className="muted">—</span>}</td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      {anyCalculated && <p className="muted small schedule-footnote">{t('rentSchedule.derivedNote')}</p>}
    </div>
  )
}

/**
 * The lease's own wording is shown under the dates only when it adds something ("Months 13-24",
 * "Lease Year 2"). Wording that already contains a year just repeats the date range.
 */
function restatesDates(label: string): boolean {
  return /\b(19|20)\d{2}\b/.test(label)
}
