import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { MIN_PASSWORD_LENGTH } from '../lib/auth'
import { AuthCard } from '../components/AuthCard'
import { Alert } from '../components/Alert'
import { t } from '../i18n'

export function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < MIN_PASSWORD_LENGTH) {
      return setError(t('common.passwordTooShort', { min: MIN_PASSWORD_LENGTH }))
    }
    if (password !== confirm) return setError(t('common.passwordsDontMatch'))

    setBusy(true)
    const { data, error } = await supabase.auth.signUp({ email, password })
    setBusy(false)
    if (error) return setError(error.message)

    // With email confirmations off (the local default) a session is returned and GuestRoute
    // redirects into the app. With confirmations on, the user must click the emailed link first.
    if (!data.session) setInfo(t('signup.checkEmail'))
  }

  return (
    <AuthCard
      title={t('signup.title')}
      footer={
        <>
          {t('signup.haveAccount')} <Link to="/login">{t('signup.logInLink')}</Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="form">
        <label>
          {t('common.email')}
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          {t('common.password')}
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
        <Alert kind="success" message={info} />
        <button type="submit" disabled={busy}>
          {busy ? t('common.loading') : t('signup.submit')}
        </button>
      </form>
    </AuthCard>
  )
}
