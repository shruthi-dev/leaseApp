import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { leaseTitle, type Lease } from '../lib/leases'
import { analyzed, currentMonthlyRent, formatTerm, leasePhase, sumByCurrency, DEFAULT_CURRENCY } from '../lib/portfolio'
import { formatDate, formatMoney } from '../lib/format'
import { downloadCsv, toCsv } from '../lib/csv'
import { ReportToolbar } from './ReportToolbar'
import { t, type MessageKey } from '../i18n'

type SortKey = 'tenant' | 'expiration' | 'rent'

/** Four short columns (secondary facts stacked beneath) so it fits without horizontal scrolling. */
export function RentRollReport({ leases, today }: { leases: Lease[]; today: string }) {
  const [includeUpcoming, setIncludeUpcoming] = useState(false)
  // Today's rent: the rent schedule's current period where the lease has one (matches the Dashboard).
  const rent = (l: Lease) => currentMonthlyRent(l, today)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'expiration', dir: 1 })

  const rows = useMemo(() => {
    const picked = analyzed(leases).filter((l) => {
      const phase = leasePhase(l, today)
      return phase === 'active' || (includeUpcoming && phase === 'upcoming')
    })
    const value = (l: Lease): string | number => {
      if (sort.key === 'tenant') return leaseTitle(l).toLowerCase()
      if (sort.key === 'rent') return rent(l) ?? -1
      return l.expiration_date ?? '9999'
    }
    return picked.sort((a, b) => (value(a) < value(b) ? -sort.dir : value(a) > value(b) ? sort.dir : 0))
  }, [leases, today, includeUpcoming, sort])

  const totals = useMemo(() => {
    const deposits = new Map(sumByCurrency(rows, (l) => l.security_deposit))
    return sumByCurrency(rows, rent).map(([currency, monthly]) => ({
      currency,
      monthly,
      deposit: deposits.get(currency) ?? 0,
    }))
  }, [rows])

  function exportCsv() {
    const csv = toCsv(
      ['Tenant', 'Landlord', 'Address', 'Premises', 'Commencement', 'Expiration', 'Remaining', 'Current monthly rent', 'Current annual rent', 'Starting monthly rent', 'Security deposit', 'Currency', 'File'],
      rows.map((l) => [
        l.tenant,
        l.landlord,
        l.premises_address,
        l.premises,
        l.commencement_date,
        l.expiration_date,
        formatTerm(today, l.expiration_date),
        rent(l),
        rent(l) !== null ? rent(l)! * 12 : null,
        l.monthly_rent,
        l.security_deposit,
        l.currency ?? DEFAULT_CURRENCY,
        l.file_name,
      ]),
    )
    downloadCsv(`rent-roll-${today}.csv`, csv)
  }

  const header = (key: SortKey, label: MessageKey, className?: string) => (
    <th className={className} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button
        className="sort-button"
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : 1 }))}
      >
        {t(label)}
        <span className="sort-arrow" aria-hidden="true">
          {sort.key === key ? (sort.dir === 1 ? '▲' : '▼') : ''}
        </span>
      </button>
    </th>
  )

  return (
    <>
      <ReportToolbar onExport={exportCsv} canExport={rows.length > 0}>
        <label className="checkbox">
          <input type="checkbox" checked={includeUpcoming} onChange={(e) => setIncludeUpcoming(e.target.checked)} />
          {t('reports.includeUpcoming')}
        </label>
        <span className="muted small">{t('reports.rentNote')}</span>
      </ReportToolbar>

      {rows.length === 0 ? (
        <p className="empty muted">{t('reports.empty')}</p>
      ) : (
        <table className="data-table responsive-table">
          <thead>
            <tr>
              {header('tenant', 'columns.tenant')}
              {header('expiration', 'columns.term')}
              {header('rent', 'reports.currentRent', 'num')}
              <th className="num">{t('columns.deposit')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                <td className="cell-primary">
                  <Link to={`/leases/${l.id}`} className="row-title">
                    {leaseTitle(l)}
                  </Link>
                  {leasePhase(l, today) === 'upcoming' && (
                    <span className="badge badge-neutral tag">{t('reports.upcomingTag')}</span>
                  )}
                  <div className="muted small">{l.premises_address ?? l.premises ?? '—'}</div>
                </td>
                <td data-label={t('columns.term')}>
                  <div className="nowrap">{t('leases.until', { date: formatDate(l.expiration_date) })}</div>
                  <div className="muted small nowrap">
                    {t('reports.remainingShort', { term: formatTerm(today, l.expiration_date) })}
                  </div>
                </td>
                <td className="num" data-label={t('reports.currentRent')}>
                  <div className="nowrap">{formatMoney(rent(l), l.currency)}</div>
                  {rent(l) !== null && (
                    <div className="muted small nowrap">
                      {t('reports.perYear', { amount: formatMoney(rent(l)! * 12, l.currency) })}
                    </div>
                  )}
                  {/* Rent stepped up (or down) under the schedule: keep the starting rent visible. */}
                  {rent(l) !== l.monthly_rent && l.monthly_rent !== null && (
                    <div className="muted small nowrap">
                      {t('reports.startingRent', { amount: formatMoney(l.monthly_rent, l.currency) })}
                    </div>
                  )}
                </td>
                <td className="num nowrap" data-label={t('columns.deposit')}>
                  {formatMoney(l.security_deposit, l.currency)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {totals.map((row) => (
              <tr key={row.currency}>
                <td colSpan={2} className="cell-primary">
                  {totals.length > 1 ? t('reports.totalCurrency', { currency: row.currency }) : t('reports.total')}
                  <span className="muted"> · {t('reports.leaseCount', { count: rows.length })}</span>
                </td>
                <td className="num" data-label={t('reports.currentRent')}>
                  <div className="nowrap">{formatMoney(row.monthly, row.currency)}</div>
                  <div className="muted small nowrap">
                    {t('reports.perYear', { amount: formatMoney(row.monthly * 12, row.currency) })}
                  </div>
                </td>
                <td className="num nowrap" data-label={t('columns.deposit')}>
                  {formatMoney(row.deposit, row.currency)}
                </td>
              </tr>
            ))}
          </tfoot>
        </table>
      )}
    </>
  )
}
