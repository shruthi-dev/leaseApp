import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ProcessedDoc } from '../lib/documents'
import { formatDuration, totalMs } from '../lib/metrics'
import { ClockIcon } from './Icons'
import { t, type MessageKey } from '../i18n'

const POPOVER_W = 260

/**
 * Clock icon that shows a document's processing details (file type, pages, time per step) on
 * hover, keyboard focus or tap. The card is rendered into <body> with fixed positioning so the
 * table's rounded, overflow-hidden card never clips it.
 */
export function ProcessingInfo({ doc, label }: { doc: ProcessedDoc; label: string }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open || !button.current) return
    const r = button.current.getBoundingClientRect()
    const above = r.bottom + 230 > window.innerHeight
    setPos({
      top: above ? r.top - 8 : r.bottom + 8,
      left: Math.max(8, Math.min(r.right - POPOVER_W, window.innerWidth - POPOVER_W - 8)),
      above,
    })
    const close = () => setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const total = totalMs(doc)
  const pages =
    doc.page_count === null
      ? '—'
      : doc.text_pages !== null && doc.text_pages !== doc.page_count
        ? t('processing.pagesWithText', { text: doc.text_pages, total: doc.page_count })
        : String(doc.page_count)

  return (
    <>
      <button
        ref={button}
        className="icon-button"
        aria-label={`${t('processing.detailsTitle')}: ${label}`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        // Open only: a tap also fires focus, so toggling would close it again. Blur, Esc and scroll close it.
        onClick={() => setOpen(true)}
      >
        <ClockIcon />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            className={`processing-popover${pos.above ? ' above' : ''}`}
            style={{ top: pos.top, left: pos.left, width: POPOVER_W }}
          >
            <strong className="popover-title">{t('processing.detailsTitle')}</strong>
            <dl>
              <Row label={t('processing.fileType')}>
                {doc.pdf_type ? (
                  <span className={`file-type ${doc.pdf_type}`}>{t(`pdfType.${doc.pdf_type}` as MessageKey)}</span>
                ) : (
                  '—'
                )}
              </Row>
              <Row label={t('detail.pages')}>{pages}</Row>
              <Row label={t('processing.upload')}>{formatDuration(doc.upload_ms)}</Row>
              <Row label={t('processing.extraction')}>{formatDuration(doc.extraction_ms)}</Row>
              <Row label={t('processing.analysis')}>{formatDuration(doc.analysis_ms)}</Row>
              <Row label={t('processing.total')} strong>
                {formatDuration(total)}
              </Row>
            </dl>
            {total === null && <p className="popover-note">{t('processing.noTimings')}</p>}
          </div>,
          document.body,
        )}
    </>
  )
}

function Row({ label, strong, children }: { label: string; strong?: boolean; children: React.ReactNode }) {
  return (
    <div className={strong ? 'popover-row total' : 'popover-row'}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** Small tag for the file type: neutral for digital, highlighted for scanned or partly scanned. */
export function FileTypeTag({ type }: { type: ProcessedDoc['pdf_type'] }) {
  if (!type) return null
  return (
    <span className={`file-type ${type}`} title={t(`pdfType.${type}Hint` as MessageKey)}>
      {t(`pdfType.${type}` as MessageKey)}
    </span>
  )
}
