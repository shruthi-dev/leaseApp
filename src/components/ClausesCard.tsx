import type { Lease } from '../lib/leases'
import { clauseTypeLabel, type Clause } from '../lib/clauses'
import { clauseCount } from '../lib/metrics'
import { t } from '../i18n'

/** Notable clauses Claude found in the lease, in document order, each with its page and an excerpt. */
export function ClausesCard({
  lease,
  pdfUrl,
  onExtract,
  extracting,
}: {
  lease: Lease
  pdfUrl: string | null
  /** Offered when clauses were never extracted: fetches just the missing parts. */
  onExtract?: () => void
  extracting?: boolean
}) {
  const count = clauseCount(lease)
  const clauses: Clause[] = Array.isArray(lease.clauses) ? lease.clauses : []

  return (
    <div className="card">
      <h2>{t('clauses.title')}</h2>
      {count === null ? (
        <div className="empty-action">
          <p className="muted">{t('clauses.notExtracted')}</p>
          {onExtract && (
            <button onClick={onExtract} disabled={extracting}>
              {extracting ? t('missing.running') : t('missing.button')}
            </button>
          )}
        </div>
      ) : clauses.length === 0 ? (
        <p className="muted">{t('clauses.none')}</p>
      ) : (
        <>
          <p className="muted small">{t('clauses.hint')}</p>
          <ol className="clause-list">
            {clauses.map((c, i) => (
              <li key={i} className="clause">
                <div className="clause-head">
                  <span className="badge badge-neutral">{t(clauseTypeLabel(c.type))}</span>
                  <strong className="clause-title">{c.title ?? t(clauseTypeLabel(c.type))}</strong>
                  {c.page &&
                    (pdfUrl ? (
                      <a
                        className="page-ref"
                        href={`${pdfUrl}#page=${c.page}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={t('detail.openAtPage', { page: c.page })}
                      >
                        {t('common.page', { page: c.page })}
                      </a>
                    ) : (
                      <span className="page-ref">{t('common.page', { page: c.page })}</span>
                    ))}
                </div>
                {c.summary && <p className="clause-summary">{c.summary}</p>}
                {c.quote && <blockquote className="evidence-quote">“{c.quote}”</blockquote>}
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}
