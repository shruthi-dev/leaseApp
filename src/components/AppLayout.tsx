import { NavLink, Outlet } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { t } from '../i18n'

export function AppLayout() {
  const { user } = useAuth()

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">{t('appName')}</span>
        <nav>
          <NavLink to="/" end>
            {t('nav.dashboard')}
          </NavLink>
        </nav>
        <div className="topbar-right">
          <span className="muted">{user?.email}</span>
          <button className="link-button" onClick={() => supabase.auth.signOut()}>
            {t('common.signOut')}
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
