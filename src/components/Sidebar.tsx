import type { ComponentType, SVGProps } from 'react'
import { NavLink } from 'react-router-dom'
import { ChartIcon, ChevronsLeftIcon, DashboardIcon, FileIcon } from './Icons'
import { t, type MessageKey } from '../i18n'

// Main menu. Add new sections here and in routes.tsx.
const NAV_ITEMS: { to: string; label: MessageKey; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { to: '/leases', label: 'nav.leases', icon: FileIcon },
  { to: '/dashboard', label: 'nav.dashboard', icon: DashboardIcon },
  { to: '/reports', label: 'nav.reports', icon: ChartIcon },
]

interface Props {
  /** Desktop: icons-only rail. */
  collapsed: boolean
  /** Mobile: drawer is showing. */
  drawerOpen: boolean
  onToggleCollapsed: () => void
  onNavigate: () => void
}

export function Sidebar({ collapsed, drawerOpen, onToggleCollapsed, onNavigate }: Props) {
  const classes = ['sidebar', collapsed && 'collapsed', drawerOpen && 'drawer-open'].filter(Boolean).join(' ')
  const toggleLabel = collapsed ? t('nav.expand') : t('nav.collapse')

  return (
    <aside id="sidebar" className={classes}>
      <nav className="side-nav" aria-label={t('nav.main')}>
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className="side-link"
            // Collapsed rail hides labels, so expose the name on hover.
            title={collapsed ? t(label) : undefined}
            onClick={onNavigate}
          >
            <Icon width="20" height="20" className="side-icon" />
            <span className="side-label">{t(label)}</span>
          </NavLink>
        ))}
      </nav>

      <div className="side-footer">
        <button
          className="icon-button side-toggle"
          aria-label={toggleLabel}
          aria-expanded={!collapsed}
          title={toggleLabel}
          onClick={onToggleCollapsed}
        >
          <ChevronsLeftIcon width="20" height="20" className="side-icon" />
        </button>
      </div>
    </aside>
  )
}
