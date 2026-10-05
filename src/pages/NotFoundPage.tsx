import { Link } from 'react-router-dom'
import { t } from '../i18n'

export function NotFoundPage() {
  return (
    <div className="centered">
      <h1>{t('notFound.title')}</h1>
      <Link to="/">{t('notFound.home')}</Link>
    </div>
  )
}
