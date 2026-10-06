import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { StatTile } from '../components/StatTile'
import { ExpirationChart } from '../components/ExpirationChart'
import { Alert } from '../components/Alert'
import { useLeases } from '../lib/useLeases'
import { canRetry, leaseTitle, type Lease } from '../lib/leases'
import { daysBetween, expirationsByMonth, summarize, sumByCurrency, todayIso } from '../lib/portfolio'
import { formatDate, formatMoneyCompact } from '../lib/format'
import { t } from '../i18n'

const SOON_LIMIT = 6
const URGENT_DAYS = 90

export function DashboardPage() {
  const { leases, loading, error } = useLeases()
  const today = todayIso()
  const summary = useMemo(() => summarize(leases, today), [leases, today])
  const buckets = useMemo(() => expirationsByMonth(leases, today), [leases, today])
  const needsAttention = leases.filter(canRetry).length

  if (loading) return <p className="empty muted">{t('common.loading')}</p>

  const [primaryRent, ...otherRent] = summary.activeMonthlyRent
  const expiringRent = sumByCurrency(summary.expiring12, (l) => l.monthly_rent)[0]

  return (
    <section className="page">
      <header className="page-header">
        <h1>{t('dashboard.title')}</h1>
        {summary.total > 0 && (
          <p className="muted">
            {summary.total === 1
              ? t('dashboard.subtitleOne', { date: formatDate(today) })
              : t('dashboard.subtitle', { date: formatDate(today), count: summary.total })}
          </p>
        )}
      </header>

      {error && <Alert kind="error" message={t('leases.loadError', { message: error })} />}
      {needsAttention > 0 && (
        <div className="notice">
          <span>
            {needsAttention === 1
              ? t('dashboard.attentionOne')
              : t('dashboard.attention', { count: needsAttention })}
          </span>
          <Link to="/leases">{t('dashboard.review')}</Link>
        </div>
      )}

      {summary.total === 0 ? (
        <div className="card placeholder">
          <h2>{t('dashboard.emptyTitle')}</h2>
          <p className="muted">{t('dashboard.emptyBody')}</p>
          <Link to="/leases" className="button-link">
            {t('dashboard.goUpload')}
          </Link>
        </div>
      ) : (
        <>
          <div className="kpi-row">
            <StatTile
              label={t('dashboard.active')}
              value={summary.active.length.toLocaleString()}
              hint={t('dashboard.activeHint')}
              to="/reports?tab=rent-roll"
            />
            <StatTile
              label={t('dashboard.expiring')}
              value={summary.expiring12.length.toLocaleString()}
              hint={
                expiringRent
                  ? t('dashboard.expiringHint', { rent: formatMoneyCompact(expiringRent[1], expiringRent[0]) })
                  : t('dashboard.expiringNone')
              }
              to="/reports?tab=schedule"
            />
            <StatTile
              label={t('dashboard.expired')}
              value={summary.expired.length.toLocaleString()}
              hint={t('dashboard.expiredHint')}
              to="/reports?tab=schedule&expired=1"
            />
            <StatTile
              label={t('dashboard.monthlyRent')}
              value={primaryRent ? formatMoneyCompact(primaryRent[1], primaryRent[0]) : '—'}
              hint={
                primaryRent && (
                  <>
                    {t('dashboard.monthlyRentHint', { annual: formatMoneyCompact(primaryRent[1] * 12, primaryRent[0]) })}
                    {otherRent.length > 0 && (
                      <>
                        <br />
                        {t('dashboard.otherCurrencies', {
                          list: otherRent.map(([c, v]) => formatMoneyCompact(v, c)).join(', '),
                        })}
                      </>
                    )}
                  </>
                )
              }
              to="/reports?tab=rent-roll"
            />
          </div>

          <div className="dashboard-grid">
            <div className="card chart-card">
              <div className="card-head">
                <h2>{t('dashboard.chartTitle')}</h2>
                <p className="muted small">{t('dashboard.chartSubtitle')}</p>
              </div>
              {buckets.every((b) => b.leases.length === 0) ? (
                <p className="empty muted">{t('dashboard.chartEmpty')}</p>
              ) : (
                <ExpirationChart buckets={buckets} />
              )}
            </div>

            <div className="card soon-card">
              <div className="card-head">
                <h2>{t('dashboard.soonTitle')}</h2>
              </div>
              {summary.expiring12.length === 0 ? (
                <p className="muted small">{t('dashboard.soonEmpty')}</p>
              ) : (
                <ul className="soon-list">
                  {summary.expiring12.slice(0, SOON_LIMIT).map((lease) => (
                    <SoonItem key={lease.id} lease={lease} today={today} />
                  ))}
                </ul>
              )}
              <Link to="/reports?tab=schedule" className="small card-foot-link">
                {t('dashboard.viewSchedule')} →
              </Link>
            </div>
          </div>

          {(summary.upcoming.length > 0 || summary.undated.length > 0) && (
            <p className="muted small">
              {t('dashboard.otherInfo', { upcoming: summary.upcoming.length, undated: summary.undated.length })}
            </p>
          )}
        </>
      )}
    </section>
  )
}

function SoonItem({ lease, today }: { lease: Lease; today: string }) {
  const days = daysBetween(today, lease.expiration_date!)
  const label = days === 0 ? t('dashboard.today') : days === 1 ? t('dashboard.inDaysOne') : t('dashboard.inDays', { count: days })
  return (
    <li>
      <div className="soon-main">
        <Link to={'/leases/' + lease.id} className="row-title">
          {leaseTitle(lease)}
        </Link>
        <span className="muted small clamp-line">{lease.premises_address ?? lease.premises ?? lease.file_name}</span>
      </div>
      <div className="soon-side">
        <span className="small">{formatDate(lease.expiration_date)}</span>
        <span className={`badge ${days <= URGENT_DAYS ? 'badge-warning' : 'badge-neutral'}`}>{label}</span>
      </div>
    </li>
  )
}
