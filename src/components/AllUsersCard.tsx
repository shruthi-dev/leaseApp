import { useMemo, useState } from 'react'
import { Alert } from './Alert'
import { SearchIcon } from './Icons'
import type { OrgUser } from '../lib/admin'
import { sharePortfolio, SharingError } from '../lib/sharing'
import { errorMessage } from '../lib/errors'
import { formatDate, initials } from '../lib/format'
import { t } from '../i18n'

/**
 * Admins only: every user in the organization, with sign-up date, last sign-in and lease count,
 * and an Add button that lets them view the admin's leases.
 */
export function AllUsersCard({
  users,
  meId,
  onShared,
}: {
  users: OrgUser[]
  meId: string | undefined
  onShared: () => void
}) {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? users.filter((u) => u.email.toLowerCase().includes(q)) : users
  }, [users, query])

  async function add(user: OrgUser) {
    setBusy(user.id)
    setError(null)
    try {
      await sharePortfolio(user.email)
      onShared()
    } catch (err) {
      setError(err instanceof SharingError && err.code ? t(`sharing.errors.${err.code}`) : errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="card table-card">
      <div className="table-card-head">
        <div>
          <h2>
            {t('admin.allUsersTitle')} <span className="muted">({users.length})</span>
          </h2>
          <p className="muted small">{t('admin.allUsersHint')}</p>
        </div>
        <label className="search">
          <SearchIcon />
          <input
            type="search"
            placeholder={t('admin.searchPlaceholder')}
            aria-label={t('admin.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {error && (
        <div className="table-card-alert">
          <Alert kind="error" message={error} />
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="empty muted">{t('admin.noMatches')}</p>
      ) : (
        <table className="data-table responsive-table users-table">
          <thead>
            <tr>
              <th>{t('admin.user')}</th>
              <th>{t('admin.signedUp')}</th>
              <th>{t('admin.lastSignIn')}</th>
              <th className="num">{t('admin.leases')}</th>
              <th>{t('admin.access')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const me = u.id === meId
              return (
                <tr key={u.id}>
                  <td className="cell-primary">
                    <div className="user-cell">
                      <span className="avatar">{initials(u.email)}</span>
                      <div className="user-row-text">
                        <strong className="ellipsis" title={u.email}>
                          {u.email}
                        </strong>
                        <span className="muted small">
                          {u.role === 'admin' ? t('admin.roleAdmin') : t('admin.roleMember')}
                          {me && ` · ${t('sharing.you')}`}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="nowrap" data-label={t('admin.signedUp')}>
                    {formatDate(u.created_at.slice(0, 10))}
                  </td>
                  <td className="nowrap" data-label={t('admin.lastSignIn')}>
                    {u.last_sign_in_at ? formatDate(u.last_sign_in_at.slice(0, 10)) : <span className="muted">{t('admin.never')}</span>}
                  </td>
                  <td className="num" data-label={t('admin.leases')}>
                    {u.lease_count}
                  </td>
                  <td data-label={t('admin.access')}>
                    {me ? (
                      <span className="role-tag owner">{t('sharing.roleOwner')}</span>
                    ) : u.can_view_my_leases ? (
                      <span className="role-tag">{t('admin.canView')}</span>
                    ) : (
                      <button
                        className="button-secondary button-small"
                        disabled={busy === u.id}
                        aria-label={`${t('admin.add')}: ${u.email}`}
                        title={t('admin.addHint')}
                        onClick={() => add(u)}
                      >
                        {busy === u.id ? t('common.loading') : t('admin.add')}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
