import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Alert } from '../components/Alert'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { TrashIcon } from '../components/Icons'
import { AllUsersCard } from '../components/AllUsersCard'
import { OrganizationCard } from '../components/OrganizationCard'
import { getMyRole, listAdmins, listUsers, type OrgUser, type Role } from '../lib/admin'
import { useAuth } from '../lib/auth'
import { listShares, removeShare, sharePortfolio, SharingError, type PortfolioShare } from '../lib/sharing'
import { errorMessage } from '../lib/errors'
import { formatDate, initials } from '../lib/format'
import { t } from '../i18n'

/**
 * Settings → Users: the people the current user's portfolio is shared with (view only), a form to
 * add someone by email, and the portfolios other people share with the current user. Admins also
 * see every signed-up user in the organization.
 */
export function SettingsPage() {
  const { user } = useAuth()
  const [mine, setMine] = useState<PortfolioShare[]>([])
  const [withMe, setWithMe] = useState<PortfolioShare[]>([])
  const [role, setRole] = useState<Role>('member')
  const [admins, setAdmins] = useState<string[]>([])
  const [allUsers, setAllUsers] = useState<OrgUser[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [toRemove, setToRemove] = useState<PortfolioShare | null>(null)
  const [removing, setRemoving] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [shares, myRole, adminEmails] = await Promise.all([listShares(), getMyRole(), listAdmins()])
      setAdmins(adminEmails)
      setMine(shares.mine)
      setWithMe(shares.withMe)
      setRole(myRole)
      setAllUsers(myRole === 'admin' ? await listUsers() : [])
      setLoadError(null)
    } catch (err) {
      setLoadError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    setAddError(null)
    setNotice(null)
    setAdding(true)
    try {
      const share = await sharePortfolio(email)
      setEmail('')
      setNotice(t('sharing.added', { email: share.viewer_email }))
      await refresh()
    } catch (err) {
      setAddError(
        err instanceof SharingError && err.code ? t(`sharing.errors.${err.code}`) : errorMessage(err),
      )
    } finally {
      setAdding(false)
    }
  }

  async function confirmRemove() {
    if (!toRemove) return
    setRemoving(true)
    setNotice(null)
    try {
      await removeShare(toRemove)
      const leaving = toRemove.viewer_id === user?.id
      setNotice(
        leaving
          ? t('sharing.left', { email: toRemove.owner_email })
          : t('sharing.removed', { email: toRemove.viewer_email }),
      )
      await refresh()
    } catch (err) {
      setLoadError(errorMessage(err))
    } finally {
      setRemoving(false)
      setToRemove(null)
    }
  }

  const leavingShare = !!toRemove && toRemove.viewer_id === user?.id

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>{t('settings.title')}</h1>
          <p className="muted">{t('settings.subtitle')}</p>
        </div>
      </header>

      {loadError && <Alert kind="error" message={loadError} />}
      <Alert kind="success" message={notice} />

      {!loading && (
        <OrganizationCard role={role} admins={admins} />
      )}

      <div className="card">
        <div className="card-head-row">
          <div>
            <h2>{t('sharing.usersTitle')}</h2>
            <p className="muted small">{t('sharing.usersHint')}</p>
          </div>
        </div>

        <form className="add-user-form" onSubmit={onAdd}>
          <label className="add-user-field">
            <span className="visually-hidden">{t('common.email')}</span>
            <input
              type="email"
              required
              placeholder={t('sharing.emailPlaceholder')}
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button type="submit" disabled={adding || !email.trim()}>
            {adding ? t('common.loading') : t('sharing.addUser')}
          </button>
        </form>
        <Alert kind="error" message={addError} />
        <p className="muted small">{t('sharing.signupNote')}</p>

        <ul className="user-list">
          {/* The owner is always listed first. */}
          <li className="user-row">
            <span className="avatar">{initials(user?.email)}</span>
            <div className="user-row-text">
              <strong className="ellipsis">{user?.email}</strong>
              <span className="muted small">{t('sharing.you')}</span>
            </div>
            <span className="role-tag owner">{role === 'admin' ? t('admin.roleAdmin') : t('sharing.roleOwner')}</span>
            <span className="user-row-action" />
          </li>
          {loading ? (
            <li className="muted small user-row-empty">{t('common.loading')}</li>
          ) : (
            mine.map((s) => (
              <li key={s.viewer_id} className="user-row">
                <span className="avatar">{initials(s.viewer_email)}</span>
                <div className="user-row-text">
                  <strong className="ellipsis">{s.viewer_email}</strong>
                  <span className="muted small">{t('sharing.addedOn', { date: formatDate(s.created_at.slice(0, 10)) })}</span>
                </div>
                <span className="role-tag">{t('sharing.roleViewer')}</span>
                <button
                  className="icon-button danger user-row-action"
                  title={t('sharing.remove')}
                  aria-label={`${t('sharing.remove')}: ${s.viewer_email}`}
                  onClick={() => setToRemove(s)}
                >
                  <TrashIcon />
                </button>
              </li>
            ))
          )}
          {!loading && mine.length === 0 && <li className="muted small user-row-empty">{t('sharing.noUsers')}</li>}
        </ul>
      </div>

      {role === 'admin' && (
        <AllUsersCard
          users={allUsers}
          meId={user?.id}
          onShared={() => {
            setNotice(null)
            refresh()
          }}
        />
      )}

      {withMe.length > 0 && (
        <div className="card">
          <div className="card-head-row">
            <div>
              <h2>{t('sharing.withMeTitle')}</h2>
              <p className="muted small">{t('sharing.withMeHint')}</p>
            </div>
          </div>
          <ul className="user-list">
            {withMe.map((s) => (
              <li key={s.owner_id} className="user-row">
                <span className="avatar">{initials(s.owner_email)}</span>
                <div className="user-row-text">
                  <strong className="ellipsis">{s.owner_email}</strong>
                  <span className="muted small">{t('sharing.addedOn', { date: formatDate(s.created_at.slice(0, 10)) })}</span>
                </div>
                <span className="role-tag">{t('sharing.roleViewer')}</span>
                <button className="button-secondary user-row-action" onClick={() => setToRemove(s)}>
                  {t('sharing.leave')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={!!toRemove}
        title={leavingShare ? t('sharing.leaveTitle') : t('sharing.removeTitle')}
        body={
          leavingShare
            ? t('sharing.leaveBody', { email: toRemove?.owner_email ?? '' })
            : t('sharing.removeBody', { email: toRemove?.viewer_email ?? '' })
        }
        confirmLabel={leavingShare ? t('sharing.leave') : t('sharing.remove')}
        busy={removing}
        onConfirm={confirmRemove}
        onCancel={() => !removing && setToRemove(null)}
      />
    </section>
  )
}
