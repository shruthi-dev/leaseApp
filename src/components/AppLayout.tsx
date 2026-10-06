import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { LogoMark, MenuIcon } from './Icons'
import { Sidebar } from './Sidebar'
import { UserMenu } from './UserMenu'
import { LanguageSwitcher } from './LanguageSwitcher'
import { t } from '../i18n'

const COLLAPSED_KEY = 'sidebar-collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
    } catch {
      // Storage unavailable (private mode); the preference just won't persist.
    }
  }, [collapsed])

  // Close the drawer on navigation and on Escape.
  useEffect(() => setDrawerOpen(false), [location.pathname])
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  return (
    <div className="app">
      <header className="topbar">
        {/* Only shown on narrow screens, where the sidebar is a drawer. */}
        <button
          className="icon-button menu-toggle"
          aria-label={drawerOpen ? t('nav.closeMenu') : t('nav.openMenu')}
          aria-controls="sidebar"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((o) => !o)}
        >
          <MenuIcon width="20" height="20" />
        </button>
        <NavLink to="/leases" className="brand">
          <span className="brand-tile" aria-hidden="true">
            <LogoMark width="18" height="18" />
          </span>
          <span>{t('appName')}</span>
        </NavLink>
        <div className="topbar-right">
          <LanguageSwitcher />
          <UserMenu />
        </div>
      </header>

      <div className="shell">
        <Sidebar
          collapsed={collapsed}
          drawerOpen={drawerOpen}
          onToggleCollapsed={() => setCollapsed((c) => !c)}
          onNavigate={() => setDrawerOpen(false)}
        />
        {drawerOpen && <div className="scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
