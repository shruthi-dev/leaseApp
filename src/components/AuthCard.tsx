import type { ReactNode } from 'react'
import { t } from '../i18n'

/** Centered card shell shared by the auth pages. */
export function AuthCard({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="auth-shell">
      <div className="card auth-card">
        <p className="brand">{t('appName')}</p>
        <h1>{title}</h1>
        {children}
        {footer && <div className="auth-footer">{footer}</div>}
      </div>
    </div>
  )
}
