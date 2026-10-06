import { Link, useNavigate } from 'react-router-dom'
import { canRetry, isInProgress, leaseTitle, type Lease, type LeaseField, type Progress } from '../lib/leases'
import { formatDate, formatMoney } from '../lib/format'
import { leaseErrorText } from '../lib/leaseErrors'
import { StatusBadge } from './StatusBadge'
import { FileIcon, RetryIcon, TrashIcon } from './Icons'
import { t } from '../i18n'

interface Props {
  leases: Lease[]
  progress: Record<string, Progress>
  busyIds: Set<string>
  onRetry: (lease: Lease) => void
  onDelete: (lease: Lease) => void
}

/**
 * Short columns only, so the table fits without horizontal scrolling; everything else
 * lives on the lease overview page. Below 720px rows render as stacked cards.
 */
export function LeaseTable({ leases, progress, busyIds, onRetry, onDelete }: Props) {
  const navigate = useNavigate()

  return (
    <table className="lease-table responsive-table">
      <thead>
        <tr>
          <th>{t('columns.lease')}</th>
          <th>{t('columns.address')}</th>
          <th>{t('columns.term')}</th>
          <th className="num">{t('columns.monthlyRent')}</th>
          <th>{t('columns.status')}</th>
          <th className="col-actions">
            <span className="visually-hidden">{t('columns.actions')}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {leases.map((lease) => {
          const busy = busyIds.has(lease.id) || !!progress[lease.id]
          const href = `/leases/${lease.id}`
          return (
            <tr
              key={lease.id}
              className="clickable-row"
              // The title link is the accessible way in; the row click is a mouse convenience.
              onClick={(e) => {
                if (!(e.target as HTMLElement).closest('a, button')) navigate(href)
              }}
            >
              <td className="cell-primary">
                <div className="file-cell">
                  <FileIcon className="file-icon" />
                  <div className="file-text">
                    <Link to={href} className="row-title" title={leaseTitle(lease)}>
                      {leaseTitle(lease)}
                    </Link>
                    {lease.status === 'failed' && (lease.error_code || lease.error_message) ? (
                      <div className="row-error small" title={leaseErrorText(lease.error_code, lease.error_message)}>
                        {leaseErrorText(lease.error_code, lease.error_message)}
                      </div>
                    ) : (
                      <div className="muted small ellipsis" title={lease.file_name}>
                        {lease.tenant ? lease.file_name : t('leases.uploaded', { date: formatDate(lease.created_at.slice(0, 10)) })}
                        {!!lease.amendments?.length && (
                          <>
                            {' · '}
                            {lease.amendments.length === 1
                              ? t('leases.amendmentCountOne')
                              : t('leases.amendmentCount', { count: lease.amendments.length })}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </td>
              <td className="cell-address" data-label={t('columns.address')}>
                {lease.premises_address ? (
                  <span className="clamp-2" title={lease.premises_address}>
                    {lease.premises_address}
                  </span>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td data-label={t('columns.term')}>
                {lease.expiration_date ? (
                  <>
                    <div className="nowrap">
                      {t('leases.until', { date: formatDate(lease.expiration_date) })}
                      <DerivedMark lease={lease} field="expiration_date" />
                    </div>
                    {lease.commencement_date && (
                      <div className="muted small nowrap">
                        {t('leases.from', { date: formatDate(lease.commencement_date) })}
                        <DerivedMark lease={lease} field="commencement_date" />
                      </div>
                    )}
                  </>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td className="num nowrap" data-label={t('columns.monthlyRent')}>
                {formatMoney(lease.monthly_rent, lease.currency)}
                <DerivedMark lease={lease} field="monthly_rent" />
              </td>
              <td data-label={t('columns.status')}>
                <StatusBadge lease={lease} progress={progress[lease.id]} />
              </td>
              <td className="col-actions">
                <div className="row-actions">
                  {canRetry(lease) && (
                    <button
                      className="icon-button"
                      title={t('common.retry')}
                      aria-label={`${t('common.retry')}: ${leaseTitle(lease)}`}
                      disabled={busy}
                      onClick={() => onRetry(lease)}
                    >
                      <RetryIcon />
                    </button>
                  )}
                  <button
                    className="icon-button danger"
                    title={t('common.delete')}
                    aria-label={`${t('common.delete')}: ${leaseTitle(lease)}`}
                    disabled={busy || (isInProgress(lease) && !canRetry(lease))}
                    onClick={() => onDelete(lease)}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** Flags a value Claude calculated rather than read from the lease. */
export function DerivedMark({ lease, field }: { lease: Lease; field: LeaseField }) {
  if (!lease.evidence?.[field]?.derived) return null
  return (
    <abbr className="derived-mark" title={t('detail.derivedHint')}>
      {t('detail.derivedShort')}
    </abbr>
  )
}
