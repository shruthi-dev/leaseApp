import type { ReactNode } from 'react'
import { t, type MessageKey } from '../i18n'
import { LanguageSwitcher } from './LanguageSwitcher'
import { CheckIcon, LogoMark } from './Icons'

const FEATURES: MessageKey[] = ['auth.feature1', 'auth.feature2', 'auth.feature3']

/**
 * Shell shared by the auth pages: a brand panel on wide screens (what the app does) and the form
 * card, with the language picker in the corner. On narrow screens only the card shows.
 */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="auth-shell">
      <aside className="auth-aside" aria-hidden="true">
        <div className="auth-brand">
          <span className="brand-tile">
            <LogoMark width="18" height="18" />
          </span>
          <span>{t('appName')}</span>
        </div>
        <div className="auth-pitch">
          <h2>{t('auth.headline')}</h2>
          <p>{t('auth.tagline')}</p>
          <ul>
            {FEATURES.map((key) => (
              <li key={key}>
                <span className="auth-check">
                  <CheckIcon width="14" height="14" />
                </span>
                {t(key)}
              </li>
            ))}
          </ul>
        </div>
        <p className="auth-aside-foot">{t('auth.poweredBy')}</p>
      </aside>

      <main className="auth-main">
        <div className="auth-lang">
          <LanguageSwitcher />
        </div>
        <div className="card auth-card">
          <div className="auth-card-brand">
            <span className="brand-tile">
              <LogoMark width="18" height="18" />
            </span>
            <span>{t('appName')}</span>
          </div>
          <h1>{title}</h1>
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
          {children}
          {footer && <div className="auth-footer">{footer}</div>}
        </div>
      </main>
    </div>
  )
}
