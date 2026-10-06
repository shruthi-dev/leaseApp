import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { initials } from '../lib/format'
import { t } from '../i18n'

export function UserMenu() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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
        aria-label={t('nav.menu')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="avatar">{initials(user?.email)}</span>
        <span className="user-email">{user?.email}</span>
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-header">
            <span className="muted small">{t('nav.signedInAs')}</span>
            <strong>{user?.email}</strong>
          </div>
          <button role="menuitem" className="menu-item" onClick={() => supabase.auth.signOut()}>
            {t('common.signOut')}
          </button>
        </div>
      )}
    </div>
  )
}
