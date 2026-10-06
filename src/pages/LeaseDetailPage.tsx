import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLease } from '../lib/useLease'
import {
  analyzeLease,
  canRetry,
  deleteLease,
  getLeaseFileUrl,
  isInProgress,
  leaseTitle,
  retryLease,
  updateLeaseTerms,
  type EditableTerms,
  type Lease,
  type LeaseField,
} from '../lib/leases'
import { formatTerm, todayIso } from '../lib/portfolio'
import { formatBytes, formatDate, formatMoney } from '../lib/format'
import { errorMessage } from '../lib/errors'
import { leaseErrorText } from '../lib/leaseErrors'
import { StatusBadge } from '../components/StatusBadge'
import { AmendmentsCard, formatChange } from '../components/AmendmentsCard'
import { amendmentTitle, applyAmendments } from '../lib/amendments'
import { openPdf } from '../lib/openPdf'
import { LeaseTermsForm } from '../components/LeaseTermsForm'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Alert } from '../components/Alert'
import { UploadIcon } from '../components/Icons'
import { t, type MessageKey } from '../i18n'

export function LeaseDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { lease, setLease, loading, error, refresh } = useLease(id)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmReanalyze, setConfirmReanalyze] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Tab lives in the URL so links and Back work; pickRequest asks the amendments tab to open the file picker.
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'amendments' ? 'amendments' : 'terms'
  const [pickRequest, setPickRequest] = useState(0)
  const showTab = (next: 'terms' | 'amendments') => setParams(next === 'terms' ? {} : { tab: next }, { replace: true })

  const filePath = lease?.file_path
  useEffect(() => {
    if (!filePath) return
    getLeaseFileUrl(filePath)
      .then(setPdfUrl)
      .catch(() => setPdfUrl(null))
  }, [filePath])

  if (loading) return <p className="empty muted">{t('common.loading')}</p>
  if (error) return <Alert kind="error" message={t('leases.loadError', { message: error })} />
  if (!lease) {
    return (
      <div className="card placeholder">
        <h2>{t('detail.notFound')}</h2>
        <Link to="/leases">{t('detail.back')}</Link>
      </div>
    )
  }

  const today = todayIso()
  const analyzed = lease.status === 'completed'
  // Current terms = original lease terms with completed amendments applied.
  const current = applyAmendments(lease)

  async function save(terms: EditableTerms) {
    setSaving(true)
    setActionError(null)
    try {
      setLease(await updateLeaseTerms(lease!, terms))
      setEditing(false)
      setNotice(t('detail.saved'))
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function retry() {
    if (!lease) return
    setRetrying(true)
    setActionError(null)
    try {
      await retryLease(lease, () => refresh())
    } catch {
      // Saved on the lease; shown in the alert below after refresh.
    } finally {
      setRetrying(false)
      refresh()
    }
  }

  async function reanalyze() {
    setConfirmReanalyze(false)
    setRetrying(true)
    setActionError(null)
    setNotice(null)
    setEditing(false)
    try {
      const run = analyzeLease(id)
      // Show the Analyzing state right away; the function sets it as soon as it starts.
      setTimeout(refresh, 800)
      await run
    } catch {
      // The function records failures on the lease; shown after refresh.
    } finally {
      setRetrying(false)
      refresh()
    }
  }

  async function remove() {
    if (!lease) return
    setDeleting(true)
    try {
      await deleteLease(lease)
      navigate('/leases', { replace: true })
    } catch (err) {
      setActionError(errorMessage(err))
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <section className="page">
      <Link to="/leases" className="back-link small">
        ← {t('detail.back')}
      </Link>

      <header className="detail-header">
        <div className="detail-title">
          <h1>{leaseTitle(current)}</h1>
          <div className="detail-meta">
            <StatusBadge lease={current} />
            <span className="muted small ellipsis">{lease.file_name}</span>
          </div>
        </div>
        <div className="detail-actions">
          {analyzed && !editing && (
            <button
              className="button-secondary with-icon"
              onClick={() => {
                showTab('amendments')
                setPickRequest((n) => n + 1)
              }}
            >
              <UploadIcon />
              {t('amendments.upload')}
            </button>
          )}
          {pdfUrl && (
            <a className="button-secondary as-button" href={pdfUrl} target="_blank" rel="noopener noreferrer">
              {t('detail.openPdf')}
            </a>
          )}
          {analyzed && !editing && (
            <button className="button-secondary" onClick={() => { setEditing(true); setNotice(null) }}>
              {t('detail.edit')}
            </button>
          )}
          {analyzed && !editing && (
            <button className="button-secondary" onClick={() => setConfirmReanalyze(true)} disabled={retrying}>
              {t('detail.reanalyze')}
            </button>
          )}
          {canRetry(lease) && (
            <button className="button-secondary" onClick={retry} disabled={retrying}>
              {retrying ? t('common.loading') : t('common.retry')}
            </button>
          )}
          <button
            className="button-secondary danger-text"
            onClick={() => setConfirmDelete(true)}
            disabled={retrying || (isInProgress(lease) && !canRetry(lease))}
          >
            {t('common.delete')}
          </button>
        </div>
      </header>

      {lease.status === 'failed' && (lease.error_code || lease.error_message) && (
        <Alert kind="error" message={leaseErrorText(lease.error_code, lease.error_message)} />
      )}
      <Alert kind="error" message={actionError} />
      <Alert kind="success" message={notice} />

      {!analyzed ? (
        <div className="card placeholder">
          <StatusBadge lease={lease} />
          <p className="muted">{t('leases.notAnalyzed')}</p>
        </div>
      ) : (
        <div className="detail-grid">
          <div className="detail-main">
            {!editing && (
              <div className="tabs detail-tabs" role="tablist">
                <button role="tab" aria-selected={tab === 'terms'} className={tab === 'terms' ? 'tab active' : 'tab'} onClick={() => showTab('terms')}>
                  {t('detail.keyTerms')}
                </button>
                <button role="tab" aria-selected={tab === 'amendments'} className={tab === 'amendments' ? 'tab active' : 'tab'} onClick={() => showTab('amendments')}>
                  {t('amendments.title')}
                  <span className="tab-count">{lease.amendments?.length ?? 0}</span>
                </button>
              </div>
            )}
            {editing ? (
              <div className="card">
                <h2>{t('detail.editTitle')}</h2>
                {!!lease.amendments?.length && <p className="muted small">{t('amendments.editNote')}</p>}
                <LeaseTermsForm lease={lease} saving={saving} onSave={save} onCancel={() => setEditing(false)} />
              </div>
            ) : tab === 'amendments' ? (
              <AmendmentsCard lease={lease} onChanged={refresh} pickRequest={pickRequest} />
            ) : (
              <>
                {lease.summary && (
                  <div className="card">
                    <h2>{t('columns.summary')}</h2>
                    <p className="summary-text">{lease.summary}</p>
                  </div>
                )}
                <div className="card">
                  <h2>{t('detail.keyTerms')}</h2>
                  <p className="muted small">{t('detail.pageHint')}</p>
                  <dl className="terms-list">
                    <Term lease={current} pdfUrl={pdfUrl} field="tenant" label="columns.tenant" />
                    <Term lease={current} pdfUrl={pdfUrl} field="landlord" label="columns.landlord" />
                    <Term lease={current} pdfUrl={pdfUrl} field="premises_address" label="columns.address" />
                    <Term lease={current} pdfUrl={pdfUrl} field="premises" label="detail.premisesDescription" />
                    <Term lease={current} pdfUrl={pdfUrl} field="commencement_date" label="columns.commencement" />
                    <Term lease={current} pdfUrl={pdfUrl} field="expiration_date" label="columns.expiration" />
                    <Term lease={current} pdfUrl={pdfUrl} field="monthly_rent" label="columns.monthlyRent" />
                    <Term lease={current} pdfUrl={pdfUrl} field="security_deposit" label="columns.deposit" />
                    <Term lease={current} pdfUrl={pdfUrl} field="renewal_options" label="columns.renewal" />
                  </dl>
                </div>
              </>
            )}
          </div>

          <aside className="detail-side">
            <div className="card">
              <h2>{t('detail.atAGlance')}</h2>
              <dl className="facts">
                <Fact label={t('columns.term')}>
                  {current.commencement_date || current.expiration_date
                    ? `${formatDate(current.commencement_date)} – ${formatDate(current.expiration_date)}`
                    : '—'}
                </Fact>
                <Fact label={t('reports.remaining')}>{formatTerm(today, current.expiration_date)}</Fact>
                <Fact label={t('columns.monthlyRent')}>{formatMoney(current.monthly_rent, current.currency)}</Fact>
                <Fact label={t('reports.annualRent')}>
                  {formatMoney(current.monthly_rent !== null ? current.monthly_rent * 12 : null, current.currency)}
                </Fact>
              </dl>
            </div>
            <div className="card">
              <h2>{t('detail.document')}</h2>
              <dl className="facts">
                <Fact label={t('detail.fileName')}>
                  <span className="break">{lease.file_name}</span>
                </Fact>
                <Fact label={t('detail.pages')}>{lease.page_count ?? '—'}</Fact>
                <Fact label={t('detail.size')}>{formatBytes(lease.file_size) || '—'}</Fact>
                <Fact label={t('detail.uploadedOn')}>{formatDate(lease.created_at.slice(0, 10))}</Fact>
                <Fact label={t('detail.analyzedOn')}>{lease.analyzed_at ? formatDate(lease.analyzed_at.slice(0, 10)) : '—'}</Fact>
              </dl>
            </div>
          </aside>
        </div>
      )}

      <ConfirmDialog
        open={confirmReanalyze}
        title={t('detail.reanalyzeTitle')}
        body={t('detail.reanalyzeBody')}
        confirmLabel={t('detail.reanalyze')}
        tone="primary"
        onConfirm={reanalyze}
        onCancel={() => setConfirmReanalyze(false)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title={t('leases.deleteTitle')}
        body={t('leases.deleteBody', { name: lease.file_name })}
        confirmLabel={t('common.delete')}
        busy={deleting}
        onConfirm={remove}
        onCancel={() => !deleting && setConfirmDelete(false)}
      />
    </section>
  )
}

function Term({
  lease,
  pdfUrl,
  field,
  label,
}: {
  /** The lease with amendments applied. */
  lease: Lease
  pdfUrl: string | null
  field: LeaseField
  label: MessageKey
}) {
  const raw = lease[field] as string | number | null
  const value = raw === null || raw === '' ? null : formatChange(field, raw, lease.currency)
  const amended = lease.amended?.[field]
  const page = amended ? amended.change.page : lease.source_pages[field]
  const proof = lease.evidence?.[field]
  return (
    <div className="term-row">
      <dt>{t(label)}</dt>
      <dd>
        {value ?? <span className="muted">{t('detail.notFoundInLease')}</span>}
        {value && amended && (
          <span className="badge badge-info tag" title={amendmentTitle(amended.amendment)}>
            {t('amendments.amended')}
          </span>
        )}
        {value && proof?.derived && (
          <span className="badge badge-warning tag" title={t('detail.derivedHint')}>
            {t('detail.derived')}
          </span>
        )}
        {page && value && (
          amended ? (
            // Amended values point into the amendment's PDF, not the lease's.
            amended.amendment.file_path && (
              <button
                className="page-ref as-link"
                title={t('detail.openAtPage', { page })}
                onClick={() => openPdf(amended.amendment.file_path!, page)}
              >
                {t('common.page', { page })}
              </button>
            )
          ) : pdfUrl ? (
            <a
              className="page-ref"
              href={`${pdfUrl}#page=${page}`}
              target="_blank"
              rel="noopener noreferrer"
              title={t('detail.openAtPage', { page })}
            >
              {t('common.page', { page })}
            </a>
          ) : (
            <span className="page-ref" title={t('common.pageTitle', { page })}>
              {t('common.page', { page })}
            </span>
          )
        )}
        {value && proof?.quote && <blockquote className="evidence-quote">“{proof.quote}”</blockquote>}
        {amended && (
          <p className="original-value small muted">
            {t('amendments.original', {
              value: formatChange(field, amended.original, lease.amended?.currency?.original as string ?? lease.currency),
              amendment: amendmentTitle(amended.amendment),
            })}
          </p>
        )}
      </dd>
    </div>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
