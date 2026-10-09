import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { StatTile } from '../components/StatTile'
import { ExpirationChart } from '../components/ExpirationChart'
import { PortfolioStatusBar, STATE_ORDER } from '../components/PortfolioStatusBar'
import { LeaseTimeline } from '../components/LeaseTimeline'
import { TopRentChart } from '../components/TopRentChart'
import { ProcessingBadge, StatusBadge } from '../components/StatusBadge'
import { Alert } from '../components/Alert'
import { useLeases } from '../lib/useLeases'
import { isStalled, lastRunFailed, leaseTitle, missingParts, type Lease } from '../lib/leases'
import { amendmentTitle } from '../lib/amendments'
import {
  addMonths,
  analyzed,
  averageRemainingMonths,
  currentMonthlyRent,
  daysBetween,
  dashboardState,
  expirationsByMonth,
  expirationsByYear,
  summarize,
  sumByCurrency,
  todayIso,
  type DashboardState,
} from '../lib/portfolio'
import { formatDate, formatMoneyCompact } from '../lib/format'
import { t } from '../i18n'

const URGENT_DAYS = 90
const KEY_DATES_LIMIT = 7
const ACTIVITY_LIMIT = 6

export function DashboardPage() {
  const { leases, loading, error } = useLeases()
  const today = todayIso()
  const [expiryMode, setExpiryMode] = useState<'year' | 'month'>('year')

  const summary = useMemo(() => summarize(leases, today), [leases, today])
  const done = useMemo(() => analyzed(leases), [leases])
  const counts = useMemo(() => {
    const c = Object.fromEntries(STATE_ORDER.map((s) => [s, 0])) as Record<DashboardState, number>
    done.forEach((l) => (c[dashboardState(l, today)] += 1))
    return c
  }, [done, today])
  const monthBuckets = useMemo(() => expirationsByMonth(leases, today), [leases, today])
  const yearBuckets = useMemo(() => expirationsByYear(leases, today), [leases, today])

  if (loading) return <p className="empty muted">{t('common.loading')}</p>

  const [primaryRent, ...otherRent] = summary.activeMonthlyRent
  const expiringRent = sumByCurrency(summary.expiring12, (l) => currentMonthlyRent(l, today))[0]
  const deposits = sumByCurrency(summary.active, (l) => l.security_deposit)[0]
  const avgMonths = averageRemainingMonths(summary.active, today)
  const amendmentCount = leases.reduce((n, l) => n + (l.amendments?.length ?? 0), 0)
  const processing = leases.filter((l) => !l.analyzed_at && l.status !== 'failed').length
  const buckets = expiryMode === 'year' ? yearBuckets : monthBuckets

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
          <div className="kpi-row kpi-5">
            <StatTile
              label={t('dashboard.leases')}
              value={summary.total.toLocaleString()}
              hint={t('dashboard.leasesHint', { amendments: amendmentCount, processing })}
              to="/leases"
            />
            <StatTile
              label={t('dashboard.active')}
              value={summary.active.length.toLocaleString()}
              hint={
                summary.upcoming.length
                  ? t('dashboard.activeHintUpcoming', { count: summary.upcoming.length })
                  : t('dashboard.activeHint')
              }
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
                primaryRent ? (
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
                ) : (
                  t('dashboard.noActiveRent')
                )
              }
              to="/reports?tab=rent-roll"
            />
          </div>

          <Panel title={t('dashboard.statusTitle')} subtitle={t('dashboard.statusSubtitle')}>
            <PortfolioStatusBar counts={counts} />
            <dl className="mini-stats">
              <MiniStat label={t('dashboard.annualRent')}>
                {primaryRent ? formatMoneyCompact(primaryRent[1] * 12, primaryRent[0]) : '—'}
              </MiniStat>
              <MiniStat label={t('dashboard.depositsHeld')}>
                {deposits ? formatMoneyCompact(deposits[1], deposits[0]) : '—'}
              </MiniStat>
              <MiniStat label={t('dashboard.avgRemaining')}>
                {avgMonths === null
                  ? '—'
                  : avgMonths >= 12
                    ? t('reports.termYM', { years: Math.floor(avgMonths / 12), months: avgMonths % 12 })
                    : t('reports.termM', { months: avgMonths })}
              </MiniStat>
              <MiniStat label={t('dashboard.amendmentsCount')}>{amendmentCount}</MiniStat>
            </dl>
          </Panel>

          <div className="dashboard-grid">
            <Panel title={t('dashboard.timelineTitle')} subtitle={t('dashboard.timelineSubtitle')} legend>
              <LeaseTimeline leases={done} today={today} />
            </Panel>
            <Panel title={t('dashboard.keyDatesTitle')}>
              <KeyDates leases={done} today={today} />
            </Panel>
          </div>

          <div className="dashboard-grid even">
            <Panel
              title={t('dashboard.expirationsTitle')}
              subtitle={expiryMode === 'year' ? t('dashboard.byYearSubtitle') : t('dashboard.chartSubtitle')}
              action={
                <div className="segmented" role="group" aria-label={t('dashboard.expirationsTitle')}>
                  <button
                    className={expiryMode === 'year' ? 'on' : undefined}
                    aria-pressed={expiryMode === 'year'}
                    onClick={() => setExpiryMode('year')}
                  >
                    {t('dashboard.byYear')}
                  </button>
                  <button
                    className={expiryMode === 'month' ? 'on' : undefined}
                    aria-pressed={expiryMode === 'month'}
                    onClick={() => setExpiryMode('month')}
                  >
                    {t('dashboard.next12')}
                  </button>
                </div>
              }
            >
              {buckets.every((b) => b.leases.length === 0) ? (
                <p className="empty muted">
                  {expiryMode === 'year' ? t('dashboard.byYearEmpty') : t('dashboard.chartEmpty')}
                </p>
              ) : (
                <ExpirationChart key={expiryMode} buckets={buckets} mode={expiryMode} />
              )}
            </Panel>
            <Panel title={t('dashboard.topRentTitle')} subtitle={t('dashboard.topRentSubtitle')}>
              <TopRentChart leases={done} today={today} />
            </Panel>
          </div>

          <div className="dashboard-grid even">
            <Panel title={t('dashboard.activityTitle')}>
              <RecentActivity leases={leases} />
            </Panel>
            <Panel title={t('dashboard.attentionTitle')}>
              <NeedsAttention leases={leases} />
            </Panel>
          </div>
        </>
      )}
    </section>
  )
}

function Panel({
  title,
  subtitle,
  action,
  legend,
  children,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  /** Shows the lease-state legend in the header (for charts colored by state). */
  legend?: boolean
  children: ReactNode
}) {
  return (
    <div className="card panel">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="muted small">{subtitle}</p>}
        </div>
        {action}
        {legend && (
          <ul className="state-legend inline" aria-hidden="true">
            {(['active', 'expiring', 'upcoming', 'expired'] as DashboardState[]).map((s) => (
              <li key={s}>
                <span className={`swatch state-${s}`} />
                {t(`dashboard.state.${s}`)}
              </li>
            ))}
          </ul>
        )}
      </div>
      {children}
    </div>
  )
}

function MiniStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mini-stat">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** Expirations in the next 24 months and the last 12: upcoming soonest first, then most recently expired. */
function KeyDates({ leases, today }: { leases: Lease[]; today: string }) {
  const from = addMonths(today, -12)
  const until = addMonths(today, 24)
  const nearest = leases
    .filter((l) => l.expiration_date && l.expiration_date >= from && l.expiration_date <= until)
    .map((l) => ({ lease: l, days: daysBetween(today, l.expiration_date!) }))
    .sort((a, b) => Math.abs(a.days) - Math.abs(b.days))
    .slice(0, KEY_DATES_LIMIT)

  if (nearest.length === 0) return <p className="muted small">{t('dashboard.noKeyDates')}</p>
  const upcoming = nearest.filter((i) => i.days >= 0).sort((a, b) => a.days - b.days)
  const past = nearest.filter((i) => i.days < 0).sort((a, b) => b.days - a.days)

  const row = ({ lease, days }: { lease: Lease; days: number }) => (
    <li key={lease.id}>
      <div className="soon-main">
        <Link to={`/leases/${lease.id}`} className="row-title">
          {leaseTitle(lease)}
        </Link>
        <span className="muted small clamp-line">{lease.premises_address ?? lease.file_name}</span>
      </div>
      <div className="soon-side">
        <span className="small">{formatDate(lease.expiration_date)}</span>
        {days < 0 ? (
          <span className="badge badge-neutral">{t('detail.phase.expired')}</span>
        ) : (
          <span className={`badge ${days <= URGENT_DAYS ? 'badge-warning' : 'badge-info'}`}>
            {days === 0 ? t('dashboard.today') : days === 1 ? t('dashboard.inDaysOne') : t('dashboard.inDays', { count: days })}
          </span>
        )}
      </div>
    </li>
  )

  return (
    <div className="key-dates">
      {upcoming.length > 0 && (
        <>
          <h3>{t('dashboard.upcomingExpirations')}</h3>
          <ul className="soon-list">{upcoming.map(row)}</ul>
        </>
      )}
      {past.length > 0 && (
        <>
          <h3>{t('dashboard.recentlyExpired')}</h3>
          <ul className="soon-list">{past.map(row)}</ul>
        </>
      )}
      <Link to="/reports?tab=schedule&expired=1" className="small card-foot-link">
        {t('dashboard.viewSchedule')} →
      </Link>
    </div>
  )
}

/** Latest uploaded documents (leases and amendments) with their current status. */
function RecentActivity({ leases }: { leases: Lease[] }) {
  type Item = { key: string; href: string; title: string; sub: string; at: string; badge: ReactNode }
  const items: Item[] = []
  for (const l of leases) {
    items.push({
      key: l.id,
      href: `/leases/${l.id}`,
      title: leaseTitle(l),
      sub: l.file_name,
      at: l.created_at,
      badge: <StatusBadge lease={l} />,
    })
    for (const a of l.amendments ?? []) {
      items.push({
        key: a.id,
        href: `/leases/${l.id}?tab=amendments`,
        title: amendmentTitle(a),
        sub: t('processing.amendmentOf', { lease: leaseTitle(l) }),
        at: a.created_at,
        badge: <ProcessingBadge doc={a} />,
      })
    }
  }
  const latest = items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, ACTIVITY_LIMIT)
  if (latest.length === 0) return <p className="muted small">{t('dashboard.activityEmpty')}</p>

  return (
    <ul className="soon-list">
      {latest.map((i) => (
        <li key={i.key}>
          <div className="soon-main">
            <Link to={i.href} className="row-title">
              {i.title}
            </Link>
            <span className="muted small clamp-line">
              {i.sub} · {formatDate(i.at.slice(0, 10))}
            </span>
          </div>
          <div className="soon-side">{i.badge}</div>
        </li>
      ))}
    </ul>
  )
}

/** Things worth a look, each with a count and a link; all clear when there are none. */
function NeedsAttention({ leases }: { leases: Lease[] }) {
  const amendments = leases.flatMap((l) => l.amendments ?? [])
  const items = [
    { label: t('dashboard.attnFailed'), count: leases.filter((l) => l.status === 'failed').length, tone: 'danger' },
    { label: t('dashboard.attnStalled'), count: leases.filter((l) => isStalled(l)).length, tone: 'warning' },
    { label: t('dashboard.attnRerun'), count: leases.filter(lastRunFailed).length, tone: 'warning' },
    { label: t('dashboard.attnMissing'), count: leases.filter((l) => missingParts(l).length > 0).length, tone: 'info' },
    {
      label: t('dashboard.attnScanned'),
      count: leases.filter((l) => l.pdf_type === 'scanned' || l.pdf_type === 'mixed').length,
      tone: 'warning',
    },
    { label: t('dashboard.attnAmendFailed'), count: amendments.filter((a) => a.status === 'failed').length, tone: 'danger' },
  ].filter((i) => i.count > 0)

  if (items.length === 0) return <p className="all-good">✓ {t('dashboard.allGood')}</p>
  return (
    <ul className="attention-list">
      {items.map((i) => (
        <li key={i.label}>
          <Link to="/leases">{i.label}</Link>
          <span className={`badge badge-${i.tone}`}>{i.count}</span>
        </li>
      ))}
    </ul>
  )
}
