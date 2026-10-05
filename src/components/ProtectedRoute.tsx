import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { t } from '../i18n'

/** Renders child routes only when signed in; otherwise redirects to /login and remembers where to return. */
export function ProtectedRoute() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <p className="centered muted">{t('common.loading')}</p>
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

/** For login/signup pages: send signed-in users to the app. */
export function GuestRoute() {
  const { session, loading } = useAuth()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  if (loading) return <p className="centered muted">{t('common.loading')}</p>
  if (session) return <Navigate to={from} replace />
  return <Outlet />
}
