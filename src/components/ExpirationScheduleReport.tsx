import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { leaseTitle, type Lease } from '../lib/leases'
import { addMonths, analyzed, daysBetween, leasePhase, sortByExpiration, sumByCurrency, DEFAULT_CURRENCY } from '../lib/portfolio'
import { formatDate, formatMoney, formatMoneyCompact } from '../lib/format'
import { downloadCsv, toCsv } from '../lib/csv'
import { ReportToolbar } from './ReportToolbar'
import { t, type MessageKey } from '../i18n'

const WINDOWS: { months: number | null; label: MessageKey }[] = [
  { months: 12, label: 'reports.months12' },
  { months: 24, label: 'reports.months24' },
  { months: 36, label: 'reports.months36' },
  { months: 60, label: 'reports.months60' },
  { months: null, label: 'reports.allDates' },
]
const URGENT_DAYS = 90

interface Group {
  key: string
  title: string
  leases: Lease[]
}

export function ExpirationScheduleReport({
  leases,
  today,
  initialIncludeExpired,
}: {
  leases: Lease[]
  today: string
  initialIncludeExpired: boolean
}) {
  const [windowMonths, setWindowMonths] = useState<number | null>(24)
  const [includeExpired, setIncludeExpired] = useState(initialIncludeExpired)

  const rows = useMemo(() => {
    const until = windowMonths === null ? null : addMonths(today, windowMonths)
    return sortByExpiration(
      analyzed(leases).filter((l) => {
        const phase = leasePhase(l, today)
        if (phase === 'undated') return false
        if (phase === 'expired') return includeExpired
        return until === null || l.expiration_date! <= until
      }),
    )
  }, [leases, today, windowMonths, includeExpired])

  const groups = useMemo(() => {
    const out: Group[] = []
    for (const lease of rows) {
      const expired = lease.expiration_date! < today
      const key = expired ? 'expired' : lease.expiration_date!.slice(0, 4)
      let group = out.find((g) => g.key === key)
      if (!group) {
        group = { key, title: expired ? t('reports.expiredGroup') : key, leases: [] }
        out.push(group)
      }
      group.leases.push(lease)
    }
    return out
  }, [rows, today])

  function exportCsv() {
    const csv = toCsv(
      ['Expiration', 'Days left', 'Tenant', 'Landlord', 'Address', 'Premises', 'Monthly rent', 'Currency', 'Renewal options', 'File'],
      rows.map((l) => [
        l.expiration_date,
        daysBetween(today, l.expiration_date!),
        l.tenant,
        l.landlord,
        l.premises_address,
        l.premises,
        l.monthly_rent,
        l.currency ?? DEFAULT_CURRENCY,
        l.renewal_options,
        l.file_name,
      ]),
    )
    downloadCsv(`expiration-schedule-${today}.csv`, csv)
  }

  return (
    <>
      <ReportToolbar onExport={exportCsv} canExport={rows.length > 0}>
        <label className="select-label">
          {t('reports.window')}
          <select
            value={windowMonths ?? 'all'}
            onChange={(e) => setWindowMonths(e.target.value === 'all' ? null : Number(e.target.value))}
          >
            {WINDOWS.map((w) => (
              <option key={w.label} value={w.months ?? 'all'}>
                {t(w.label)}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={includeExpired} onChange={(e) => setIncludeExpired(e.target.checked)} />
          {t('reports.includeExpired')}
        </label>
      </ReportToolbar>

      {rows.length === 0 ? (
        <p className="empty muted">{t('reports.empty')}</p>
      ) : (
        <table className="data-table responsive-table">
          <thead>
            <tr>
              <th>{t('columns.tenant')}</th>
              <th>{t('columns.expiration')}</th>
              <th className="num">{t('columns.monthlyRent')}</th>
              <th>{t('columns.renewal')}</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const rent = sumByCurrency(g.leases, (l) => l.monthly_rent)
                .map(([c, v]) => formatMoneyCompact(v, c))
                .join(' + ') || '—'
              const params = { year: g.title, count: g.leases.length, rent }
              return (
                <Fragment key={g.key}>
                  <tr className="group-row">
                    <td colSpan={4}>
                      {g.leases.length === 1 ? t('reports.yearGroupOne', params) : t('reports.yearGroup', params)}
                    </td>
                  </tr>
                  {g.leases.map((l) => {
                    const days = daysBetween(today, l.expiration_date!)
                    return (
                      <tr key={l.id}>
                        <td className="cell-primary">
                          <Link to={`/leases/${l.id}`} className="row-title">
                            {leaseTitle(l)}
                          </Link>
                          <div className="muted small">{l.premises_address ?? l.premises ?? '—'}</div>
                        </td>
                        <td data-label={t('columns.expiration')}>
                          <div className="nowrap">{formatDate(l.expiration_date)}</div>
                          {days < 0 ? (
                            <span className="badge badge-neutral">{t('reports.ended')}</span>
                          ) : (
                            <span className={`badge ${days <= URGENT_DAYS ? 'badge-warning' : 'badge-neutral'}`}>
                              {days === 1 ? t('dashboard.inDaysOne') : t('dashboard.inDays', { count: days.toLocaleString() })}
                            </span>
                          )}
                        </td>
                        <td className="num nowrap" data-label={t('columns.monthlyRent')}>
                          {formatMoney(l.monthly_rent, l.currency)}
                        </td>
                        <td className="wrap-cell" data-label={t('columns.renewal')}>
                          {l.renewal_options ?? '—'}
                        </td>
                      </tr>
                    )
                  })}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      )}
    </>
  )
}
