import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { getMyRole, type Role } from '../lib/admin'
import { displayName, nameInitials } from '../lib/format'
import { ChevronDownIcon, LogOutIcon, SettingsIcon } from './Icons'
import { t } from '../i18n'

/** Header account button (avatar + name) with a menu: who is signed in, their role, Settings, Sign out. */
export function UserMenu() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [role, setRole] = useState<Role | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const name = displayName(user)

  useEffect(() => {
    if (user) getMyRole().then(setRole, () => setRole(null))
  }, [user])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="user-menu" ref={ref}>
      <button
        className="user-trigger"
        aria-label={`${t('nav.menu')}: ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={user?.email}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="avatar">{nameInitials(name)}</span>
        <span className="user-name">{name}</span>
        <ChevronDownIcon className="user-chevron" width="14" height="14" />
      </button>
      {open && (
        <div className="menu account-menu" role="menu">
          <div className="account-head">
            <span className="avatar avatar-lg">{nameInitials(name)}</span>
            <div className="account-text">
              <strong className="ellipsis">{name}</strong>
              <span className="muted small ellipsis" title={user?.email}>
                {user?.email}
              </span>
              {role && (
                <span className={role === 'admin' ? 'role-tag owner' : 'role-tag'}>
                  {role === 'admin' ? t('admin.roleAdmin') : t('admin.roleMember')}
                </span>
              )}
            </div>
          </div>
          <Link role="menuitem" to="/settings" className="menu-item with-icon" onClick={() => setOpen(false)}>
            <SettingsIcon />
            {t('nav.settings')}
          </Link>
          <button role="menuitem" className="menu-item with-icon" onClick={() => supabase.auth.signOut()}>
            <LogOutIcon />
            {t('common.signOut')}
          </button>
        </div>
      )}
    </div>
  )
}
