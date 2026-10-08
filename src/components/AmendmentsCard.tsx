import { useEffect, useRef, useState } from 'react'
import {
  AMENDABLE_FIELDS,
  amendmentTitle,
  deleteAmendment,
  retryAmendment,
  sortAmendments,
  uploadAmendment,
  type AmendableField,
  type ChangeValue,
  type Amendment,
} from '../lib/amendments'
import { canRetry, isInProgress, validatePdf, MAX_FILE_BYTES, type Progress } from '../lib/documents'
import type { Lease } from '../lib/leases'
import { formatDate, formatMoney } from '../lib/format'
import { leaseErrorText, describeLeaseError } from '../lib/leaseErrors'
import { errorMessage } from '../lib/errors'
import { openPdf } from '../lib/openPdf'
import { ProcessingBadge } from './StatusBadge'
import { ConfirmDialog } from './ConfirmDialog'
import { Alert } from './Alert'
import { FileIcon, RetryIcon, TrashIcon, UploadIcon } from './Icons'
import { t, type MessageKey } from '../i18n'

const FIELD_LABEL: Record<AmendableField, MessageKey> = {
  tenant: 'columns.tenant',
  landlord: 'columns.landlord',
  premises_address: 'columns.address',
  premises: 'detail.premisesDescription',
  commencement_date: 'columns.commencement',
  expiration_date: 'columns.expiration',
  monthly_rent: 'columns.monthlyRent',
  currency: 'detail.currency',
  security_deposit: 'columns.deposit',
  renewal_options: 'columns.renewal',
  rent_schedule: 'rentSchedule.title',
}

/** Display text for an amended value. */
export function formatChange(field: AmendableField, value: ChangeValue | null, currency: string | null): string {
  if (value === null || value === undefined) return '—'
  if (Array.isArray(value)) return value.length === 1 ? t('rentSchedule.periodsOne') : t('rentSchedule.periods', { count: value.length })
  if (field === 'commencement_date' || field === 'expiration_date') return formatDate(String(value))
  if (field === 'monthly_rent' || field === 'security_deposit') return formatMoney(Number(value), currency)
  return String(value)
}

/** Amendments of one lease: upload, processing status, what each changed, and actions. */
export function AmendmentsCard({
  lease,
  onChanged,
  pickRequest = 0,
}: {
  lease: Lease
  onChanged: () => void
  /** Incremented by the page's Upload amendment button to open the file picker. */
  pickRequest?: number
}) {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    // Runs right after the click that changed it, so the browser still allows the picker.
    if (pickRequest > 0) input.current?.click()
  }, [pickRequest])
  const [progress, setProgress] = useState<Record<string, Progress>>({})
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<Amendment | null>(null)
  const [deleting, setDeleting] = useState(false)

  const amendments = sortAmendments(lease.amendments ?? [])
  const currency = lease.currency

  const track = (id: string, p: Progress) => {
    setProgress((prev) => ({ ...prev, [id]: p }))
    onChanged()
  }
  const untrack = (id?: string) =>
    setProgress((prev) => {
      if (!id) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })

  async function onFiles(files: File[]) {
    setMessage(null)
    for (const file of files) {
      const issue = validatePdf(file)
      if (issue) {
        setMessage(
          issue === 'notPdf'
            ? t('upload.notPdf', { name: file.name })
            : t('upload.tooLarge', { name: file.name, size: MAX_FILE_BYTES / 1024 / 1024 }),
        )
        continue
      }
      let id: string | undefined
      try {
        await uploadAmendment(lease, file, (amendmentId, p) => {
          id = amendmentId
          track(amendmentId, p)
        })
      } catch (err) {
        // Once the row exists its error shows in the list; only report failures before that.
        if (!id) setMessage(t('upload.failed', { name: file.name, message: describeLeaseError(err) }))
      } finally {
        untrack(id)
        onChanged()
      }
    }
  }

  async function retry(a: Amendment) {
    setBusy((prev) => new Set(prev).add(a.id))
    try {
      await retryAmendment(a, track)
    } catch {
      // Saved on the amendment and shown in its row.
    } finally {
      untrack(a.id)
      setBusy((prev) => {
        const next = new Set(prev)
        next.delete(a.id)
        return next
      })
      onChanged()
    }
  }

  async function confirmDelete() {
    if (!toDelete) return
    setDeleting(true)
    try {
      await deleteAmendment(toDelete)
      onChanged()
    } catch (err) {
      setMessage(t('leases.deleteError', { message: errorMessage(err) }))
    } finally {
      setDeleting(false)
      setToDelete(null)
    }
  }

  return (
    <div className="card amendments-card">
      <div className="card-head-row">
        <div>
          <h2>{t('amendments.title')}</h2>
          <p className="muted small">{t('amendments.hint')}</p>
        </div>
        <button className="button-secondary with-icon" onClick={() => input.current?.click()}>
          <UploadIcon />
          {t('amendments.upload')}
        </button>
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            e.target.value = ''
            if (files.length) onFiles(files)
          }}
        />
      </div>

      <Alert kind="error" message={message} />

      {amendments.length === 0 ? (
        <p className="muted small amendments-empty">{t('amendments.empty')}</p>
      ) : (
        <ol className="amendment-list">
          {amendments.map((a) => {
            const changed = AMENDABLE_FIELDS.filter((f) => a.changes?.[f]?.value != null)
            const p = progress[a.id]
            return (
              <li key={a.id} className="amendment">
                <div className="amendment-head">
                  <FileIcon className="file-icon" />
                  <div className="amendment-title">
                    <strong>{amendmentTitle(a)}</strong>
                    <span className="muted small">
                      {a.effective_date ? t('amendments.effective', { date: formatDate(a.effective_date) }) : a.file_name}
                    </span>
                  </div>
                  {(a.status !== 'completed' || p) && <ProcessingBadge doc={a} progress={p} />}
                  <div className="row-actions">
                    {a.file_path && (
                      <button
                        className="icon-button"
                        title={t('detail.openPdf')}
                        aria-label={`${t('detail.openPdf')}: ${amendmentTitle(a)}`}
                        onClick={() => openPdf(a.file_path!)}
                      >
                        <FileIcon />
                      </button>
                    )}
                    {canRetry(a) && (
                      <button
                        className="icon-button"
                        title={t('common.retry')}
                        aria-label={`${t('common.retry')}: ${amendmentTitle(a)}`}
                        disabled={busy.has(a.id) || !!p}
                        onClick={() => retry(a)}
                      >
                        <RetryIcon />
                      </button>
                    )}
                    <button
                      className="icon-button danger"
                      title={t('common.delete')}
                      aria-label={`${t('common.delete')}: ${amendmentTitle(a)}`}
                      disabled={busy.has(a.id) || !!p || (isInProgress(a) && !canRetry(a))}
                      onClick={() => setToDelete(a)}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>

                {a.status === 'failed' && (a.error_code || a.error_message) && (
                  <p className="row-error small">{leaseErrorText(a.error_code, a.error_message)}</p>
                )}
                {a.status === 'completed' && (
                  <>
                    {a.summary && <p className="amendment-summary">{a.summary}</p>}
                    {changed.length === 0 ? (
                      <p className="muted small">{t('amendments.noChanges')}</p>
                    ) : (
                      <ul className="change-list">
                        {changed.map((f) => {
                          const change = a.changes[f]!
                          return (
                            <li key={f}>
                              <span className="change-label">{t(FIELD_LABEL[f])}</span>
                              <span className="change-value">
                                {formatChange(f, change.value, (a.changes.currency?.value as string) ?? currency)}
                              </span>
                              {change.derived && (
                                <span className="badge badge-warning tag" title={t('detail.derivedHint')}>
                                  {t('detail.derived')}
                                </span>
                              )}
                              {change.page && a.file_path && (
                                <button
                                  className="page-ref as-link"
                                  title={t('detail.openAtPage', { page: change.page })}
                                  onClick={() => openPdf(a.file_path!, change.page)}
                                >
                                  {t('common.page', { page: change.page })}
                                </button>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </>
                )}
              </li>
            )
          })}
        </ol>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title={t('amendments.deleteTitle')}
        body={t('amendments.deleteBody', { name: toDelete ? amendmentTitle(toDelete) : '' })}
        confirmLabel={t('common.delete')}
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => !deleting && setToDelete(null)}
      />
    </div>
  )
}
