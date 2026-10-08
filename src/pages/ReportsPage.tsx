import { useSearchParams } from 'react-router-dom'
import { RentRollReport } from '../components/RentRollReport'
import { ExpirationScheduleReport } from '../components/ExpirationScheduleReport'
import { ProcessingLogReport } from '../components/ProcessingLogReport'
import { Alert } from '../components/Alert'
import { useLeases } from '../lib/useLeases'
import { todayIso } from '../lib/portfolio'
import { formatDate } from '../lib/format'
import { t, type MessageKey } from '../i18n'

// Add new reports here.
const TABS: { id: string; label: MessageKey }[] = [
  { id: 'rent-roll', label: 'reports.rentRoll' },
  { id: 'schedule', label: 'reports.schedule' },
  { id: 'processing', label: 'processing.logTitle' },
]

export function ReportsPage() {
  const { leases, loading, error } = useLeases()
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((x) => x.id === params.get('tab')) ? params.get('tab')! : TABS[0].id
  const today = todayIso()
  const current = TABS.find((x) => x.id === tab)!

  return (
    <section className="page">
      <header className="page-header">
        <h1>
          {t('reports.title')}
          <span className="print-only"> · {t(current.label)}</span>
        </h1>
        <p className="muted">{t('reports.subtitle', { date: formatDate(today) })}</p>
      </header>

      {error && <Alert kind="error" message={t('leases.loadError', { message: error })} />}

      <div className="card report-card">
        <div className="tabs no-print" role="tablist">
          {TABS.map((x) => (
            <button
              key={x.id}
              role="tab"
              aria-selected={x.id === tab}
              className={x.id === tab ? 'tab active' : 'tab'}
              onClick={() => setParams({ tab: x.id }, { replace: true })}
            >
              {t(x.label)}
            </button>
          ))}
        </div>

        <div role="tabpanel">
          {loading ? (
            <p className="empty muted">{t('common.loading')}</p>
          ) : tab === 'rent-roll' ? (
            <RentRollReport leases={leases} today={today} />
          ) : tab === 'processing' ? (
            <ProcessingLogReport leases={leases} today={today} />
          ) : (
            <ExpirationScheduleReport leases={leases} today={today} initialIncludeExpired={params.get('expired') === '1'} />
          )}
        </div>
      </div>
    </section>
  )
}
