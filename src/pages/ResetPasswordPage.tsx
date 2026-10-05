import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { MIN_PASSWORD_LENGTH, useAuth } from '../lib/auth'
import { AuthCard } from '../components/AuthCard'
import { Alert } from '../components/Alert'
import { t } from '../i18n'

/**
 * Landing page for the emailed reset link. supabase-js reads the recovery token from the URL
 * and creates a session, so all that is left is updateUser.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const { session, loading } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < MIN_PASSWORD_LENGTH) {
      return setError(t('common.passwordTooShort', { min: MIN_PASSWORD_LENGTH }))
    }
    if (password !== confirm) return setError(t('common.passwordsDontMatch'))

    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setError(error.message)
    navigate('/', { replace: true })
  }

  if (loading) return <p className="centered muted">{t('common.loading')}</p>

  if (!session) {
    return (
      <AuthCard title={t('reset.title')}>
        <Alert kind="error" message={t('reset.invalidLink')} />
        <p>
          <Link to="/forgot-password">{t('reset.requestNew')}</Link>
        </p>
      </AuthCard>
    )
  }

  return (
    <AuthCard title={t('reset.title')}>
      <form onSubmit={onSubmit} className="form">
        <label>
          {t('reset.newPassword')}
          <input
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          {t('common.confirmPassword')}
          <input
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        <Alert kind="error" message={error} />
        <button type="submit" disabled={busy}>
          {busy ? t('common.loading') : t('reset.submit')}
        </button>
      </form>
    </AuthCard>
  )
}
