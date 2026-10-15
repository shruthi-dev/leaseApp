import { useState, type FormEvent } from 'react'
import { Alert } from './Alert'
import type { Role } from '../lib/admin'
import { renameOrganization, useOrganizationName } from '../lib/organization'
import { errorMessage } from '../lib/errors'
import { t } from '../i18n'

/** Organization name (admins can rename it), the user's role, and who the admins are. */
export function OrganizationCard({ role, admins }: { role: Role; admins: string[] }) {
  const name = useOrganizationName()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await renameOrganization(draft)
      setEditing(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card org-card">
      <div className="org-name-block">
        <span className="muted small">{t('org.name')}</span>
        {editing ? (
          <form className="org-rename" onSubmit={save}>
            <input
              autoFocus
              required
              maxLength={80}
              aria-label={t('org.name')}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
            />
            <button type="submit" disabled={saving || !draft.trim()}>
              {saving ? t('common.loading') : t('org.save')}
            </button>
            <button type="button" className="button-secondary" onClick={() => setEditing(false)} disabled={saving}>
              {t('common.cancel')}
            </button>
          </form>
        ) : (
          <div className="org-name-row">
            <strong className="org-name-value">{name ?? '…'}</strong>
            {role === 'admin' && (
              <button
                className="button-secondary button-small"
                onClick={() => {
                  setDraft(name ?? '')
                  setError(null)
                  setEditing(true)
                }}
              >
                {t('org.rename')}
              </button>
            )}
          </div>
        )}
        <Alert kind="error" message={error} />
      </div>
      <div className="org-facts">
        <div>
          <span className="muted small">{t('admin.yourRole')}</span>
          <strong>{role === 'admin' ? t('admin.roleAdmin') : t('admin.roleMember')}</strong>
        </div>
        <div>
          <span className="muted small">{admins.length === 1 ? t('admin.adminOne') : t('admin.adminMany')}</span>
          <strong className="org-admins">{admins.length ? admins.join(', ') : t('admin.noAdmin')}</strong>
        </div>
      </div>
    </div>
  )
}
