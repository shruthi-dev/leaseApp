import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AuthCard } from '../components/AuthCard'
import { Alert } from '../components/Alert'
import { t } from '../i18n'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setBusy(false)
    if (error) return setError(error.message)
    setSent(true)
  }

  return (
    <AuthCard title={t('forgot.title')} footer={<Link to="/login">{t('forgot.back')}</Link>}>
      {sent ? (
        <Alert kind="success" message={t('forgot.sent')} />
      ) : (
        <form onSubmit={onSubmit} className="form">
          <p className="muted">{t('forgot.intro')}</p>
          <label>
            {t('common.email')}
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <Alert kind="error" message={error} />
          <button type="submit" disabled={busy}>
            {busy ? t('common.loading') : t('forgot.submit')}
          </button>
        </form>
      )}
    </AuthCard>
  )
}
