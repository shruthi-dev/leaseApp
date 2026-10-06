import { useEffect, useRef } from 'react'
import { t } from '../i18n'

interface Props {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  busy?: boolean
  /** danger (default) for destructive actions, primary otherwise. */
  tone?: 'danger' | 'primary'
  onConfirm: () => void
  onCancel: () => void
}

/** Modal confirmation built on the native <dialog> element (focus trap and Escape for free). */
export function ConfirmDialog({ open, title, body, confirmLabel, busy, tone = 'danger', onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog ref={ref} className="dialog" onCancel={onCancel} onClose={onCancel}>
      <h2>{title}</h2>
      <p className="muted">{body}</p>
      <div className="dialog-actions">
        <button className="button-secondary" onClick={onCancel} disabled={busy}>
          {t('common.cancel')}
        </button>
        <button className={tone === 'danger' ? 'button-danger' : undefined} onClick={onConfirm} disabled={busy}>
          {busy ? t('common.loading') : confirmLabel}
        </button>
      </div>
    </dialog>
  )
}
