import type { ReactNode } from 'react'
import { t } from '../i18n'

/** Report filters on the left, export actions on the right. Hidden when printing. */
export function ReportToolbar({
  children,
  onExport,
  canExport,
}: {
  children: ReactNode
  onExport: () => void
  canExport: boolean
}) {
  return (
    <div className="report-toolbar no-print">
      <div className="report-filters">{children}</div>
      <div className="report-actions">
        <button className="button-secondary" onClick={onExport} disabled={!canExport}>
          {t('reports.exportCsv')}
        </button>
        <button className="button-secondary" onClick={() => window.print()} disabled={!canExport}>
          {t('reports.print')}
        </button>
      </div>
    </div>
  )
}
