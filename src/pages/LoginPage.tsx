import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AuthCard } from '../components/AuthCard'
import { Alert } from '../components/Alert'
import { t } from '../i18n'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    // On success GuestRoute sees the new session and redirects to the page the user came from.
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setError(error.message)
  }

  return (
    <AuthCard
      title={t('login.title')}
      footer={
        <>
          {t('login.noAccount')} <Link to="/signup">{t('login.signUpLink')}</Link>
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
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <Alert kind="error" message={error} />
        <button type="submit" disabled={busy}>
          {busy ? t('common.loading') : t('login.submit')}
        </button>
        <Link to="/forgot-password" className="small">
          {t('login.forgot')}
        </Link>
      </form>
    </AuthCard>
  )
}
