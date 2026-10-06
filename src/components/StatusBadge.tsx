import { isStalled, type Lease } from '../lib/leases'
import type { ProcessedDoc, Progress } from '../lib/documents'
import { leaseErrorText } from '../lib/leaseErrors'
import { daysBetween, leasePhase, todayIso } from '../lib/portfolio'
import { t } from '../i18n'

/** Expiring leases are flagged this many days ahead. */
const EXPIRING_SOON_DAYS = 90

/**
 * While a lease is processing (or failed) this shows the processing state. Once analyzed,
 * "Completed" says little, so it shows the lease itself: Active, Expires in N days, Expired…
 */
export function StatusBadge({ lease, progress }: { lease: Lease; progress?: Progress }) {
  if (lease.status === 'completed' && !progress) return <PhaseBadge lease={lease} />
  return <ProcessingBadge doc={lease} progress={progress} />
}

/** Processing state of any uploaded document (lease or amendment). */
export function ProcessingBadge({ doc, progress }: { doc: ProcessedDoc; progress?: Progress }) {
  if (isStalled(doc) && !progress) {
    return (
      <span className="badge badge-warning" title={t('status.stalledHint')}>
        {t('status.stalled')}
      </span>
    )
  }

  // Live progress from this tab is more precise than the stored status.
  let label: string = t(`status.${doc.status}`)
  if (progress?.step === 'extracting') label = t('status.extractingPage', progress)
  else if (progress) label = t(`status.${progress.step}`)

  if (doc.status === 'completed' && !progress) return <span className="badge badge-success">{label}</span>

  const failed = doc.status === 'failed'
  return (
    <span
      className={`badge ${failed ? 'badge-danger' : 'badge-info'}`}
      title={failed ? leaseErrorText(doc.error_code, doc.error_message) : undefined}
    >
      {!failed && <span className="spinner" aria-hidden="true" />}
      {label}
    </span>
  )
}

function PhaseBadge({ lease }: { lease: Lease }) {
  const today = todayIso()
  const phase = leasePhase(lease, today)

  if (phase === 'active') {
    const days = daysBetween(today, lease.expiration_date!)
    if (days <= EXPIRING_SOON_DAYS) {
      const label =
        days === 0 ? t('leases.expiresToday') : days === 1 ? t('leases.expiresInOne') : t('leases.expiresIn', { count: days })
      return <span className="badge badge-warning">{label}</span>
    }
    return <span className="badge badge-success">{t('detail.phase.active')}</span>
  }
  if (phase === 'upcoming') return <span className="badge badge-info">{t('detail.phase.upcoming')}</span>
  if (phase === 'expired') return <span className="badge badge-neutral">{t('detail.phase.expired')}</span>
  return <span className="badge badge-neutral">{t('detail.phase.undated')}</span>
}
