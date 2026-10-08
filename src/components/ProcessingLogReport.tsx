import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { leaseTitle, type Lease } from '../lib/leases'
import { amendmentTitle } from '../lib/amendments'
import type { ProcessedDoc } from '../lib/documents'
import { clauseCount, fieldCounts, formatDuration, totalMs } from '../lib/metrics'
import { formatDate } from '../lib/format'
import { downloadCsv, toCsv } from '../lib/csv'
import { ReportToolbar } from './ReportToolbar'
import { ProcessingBadge, StatusBadge } from './StatusBadge'
import { t, type MessageKey } from '../i18n'

interface Row {
  key: string
  leaseId: string
  kind: 'lease' | 'amendment'
  title: string
  doc: ProcessedDoc & { created_at: string; page_count: number | null }
  lease: Lease
  fields: string
  clauses: number | null
}

/** Every uploaded document (leases and amendments) with file type, pages, extraction counts and timings. */
export function ProcessingLogReport({ leases, today }: { leases: Lease[]; today: string }) {
  const rows = useMemo(() => {
    const out: Row[] = []
    for (const lease of leases) {
      const f = fieldCounts(lease)
      out.push({
        key: lease.id,
        leaseId: lease.id,
        kind: 'lease',
        title: leaseTitle(lease),
        doc: lease,
        lease,
        fields: lease.status === 'completed' ? `${f.found}/${f.total}` : '—',
        clauses: lease.status === 'completed' ? clauseCount(lease) : null,
      })
      for (const a of lease.amendments ?? []) {
        const changed = Object.values(a.changes ?? {}).filter((c) => c && c.value !== null).length
        out.push({
          key: a.id,
          leaseId: lease.id,
          kind: 'amendment',
          title: amendmentTitle(a),
          doc: a,
          lease,
          fields: a.status === 'completed' ? String(changed) : '—',
          clauses: null,
        })
      }
    }
    return out.sort((a, b) => b.doc.created_at.localeCompare(a.doc.created_at))
  }, [leases])

  const summary = useMemo(() => {
    const timed = rows.map((r) => totalMs(r.doc)).filter((n): n is number => n !== null && n > 0)
    const count = (type: string) => rows.filter((r) => r.doc.pdf_type === type).length
    return {
      documents: rows.length,
      digital: count('digital'),
      scanned: count('scanned'),
      mixed: count('mixed'),
      average: timed.length ? timed.reduce((a, b) => a + b, 0) / timed.length : null,
    }
  }, [rows])

  function exportCsv() {
    const csv = toCsv(
      ['Document', 'Kind', 'Lease', 'File', 'Status', 'File type', 'Pages', 'Pages with text', 'Fields extracted', 'Clauses found', 'Upload (ms)', 'Text extraction (ms)', 'AI analysis (ms)', 'Total (ms)', 'Uploaded'],
      rows.map((r) => [
        r.title,
        r.kind,
        leaseTitle(r.lease),
        r.doc.file_name,
        r.doc.status,
        r.doc.pdf_type,
        r.doc.page_count,
        r.doc.text_pages,
        r.fields === '—' ? null : r.fields,
        r.clauses,
        r.doc.upload_ms,
        r.doc.extraction_ms,
        r.doc.analysis_ms,
        totalMs(r.doc),
        r.doc.created_at.slice(0, 10),
      ]),
    )
    downloadCsv(`processing-log-${today}.csv`, csv)
  }

  return (
    <>
      <ReportToolbar onExport={exportCsv} canExport={rows.length > 0}>
        <span className="muted small">
          {t('processing.summary', {
            documents: summary.documents,
            digital: summary.digital,
            scanned: summary.scanned,
            mixed: summary.mixed,
            average: formatDuration(summary.average),
          })}
        </span>
      </ReportToolbar>

      {rows.length === 0 ? (
        <p className="empty muted">{t('reports.empty')}</p>
      ) : (
        <table className="data-table responsive-table">
          <thead>
            <tr>
              <th>{t('processing.document')}</th>
              <th>{t('processing.fileType')}</th>
              <th>{t('columns.extraction')}</th>
              <th>{t('processing.time')}</th>
              <th>{t('columns.status')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const total = totalMs(r.doc)
              return (
                <tr key={r.key}>
                  <td className="cell-primary">
                    <Link to={`/leases/${r.leaseId}${r.kind === 'amendment' ? '?tab=amendments' : ''}`} className="row-title">
                      {r.title}
                    </Link>
                    <div className="muted small">
                      {r.kind === 'amendment' ? t('processing.amendmentOf', { lease: leaseTitle(r.lease) }) : r.doc.file_name}
                      {' · '}
                      {formatDate(r.doc.created_at.slice(0, 10))}
                    </div>
                  </td>
                  <td data-label={t('processing.fileType')}>
                    <div className="nowrap">{r.doc.pdf_type ? t(`pdfType.${r.doc.pdf_type}` as MessageKey) : '—'}</div>
                    {r.doc.page_count !== null && (
                      <div className="muted small nowrap">
                        {r.doc.text_pages !== null && r.doc.text_pages !== r.doc.page_count
                          ? t('processing.pagesWithText', { text: r.doc.text_pages, total: r.doc.page_count })
                          : r.doc.page_count === 1
                            ? t('extraction.pagesOne')
                            : t('extraction.pages', { count: r.doc.page_count })}
                      </div>
                    )}
                  </td>
                  <td data-label={t('columns.extraction')}>
                    {r.fields === '—' ? (
                      <span className="muted">—</span>
                    ) : (
                      <>
                        <div className="nowrap">
                          {r.kind === 'amendment'
                            ? t('processing.changedFields', { count: r.fields })
                            : t('extraction.fields', { found: r.fields.split('/')[0], total: r.fields.split('/')[1] })}
                        </div>
                        {r.kind === 'lease' && (
                          <div className="muted small nowrap">
                            {r.clauses === null
                              ? t('processing.clausesUnknown')
                              : r.clauses === 1
                                ? t('extraction.clausesOne')
                                : t('extraction.clauses', { count: r.clauses })}
                          </div>
                        )}
                      </>
                    )}
                  </td>
                  <td data-label={t('processing.time')}>
                    <div className="nowrap strong">{formatDuration(total)}</div>
                    {total !== null && (
                      <div className="muted small">
                        {t('processing.breakdown', {
                          upload: formatDuration(r.doc.upload_ms),
                          extraction: formatDuration(r.doc.extraction_ms),
                          analysis: formatDuration(r.doc.analysis_ms),
                        })}
                      </div>
                    )}
                  </td>
                  <td data-label={t('columns.status')}>
                    {r.kind === 'lease' ? <StatusBadge lease={r.lease} /> : <ProcessingBadge doc={r.doc} />}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </>
  )
}
