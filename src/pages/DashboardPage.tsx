import { useAuth } from '../lib/auth'
import { t } from '../i18n'

export function DashboardPage() {
  const { user } = useAuth()
  return (
    <section>
      <h1>{t('dashboard.title')}</h1>
      <p>{t('dashboard.welcome', { email: user?.email ?? '' })}</p>
      <p className="muted">{t('dashboard.placeholder')}</p>
    </section>
  )
}
