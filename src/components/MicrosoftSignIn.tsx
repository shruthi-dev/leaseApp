import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Alert } from './Alert'
import { t } from '../i18n'

/**
 * "Continue with Microsoft" (Microsoft Entra ID / Azure AD via Supabase's `azure` provider; set it
 * up in Supabase, see README → Microsoft sign-in). The first Microsoft sign-in creates the account;
 * one with the same verified email as an existing account is linked to it.
 */
export function MicrosoftSignIn() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(oauthErrorFromUrl)

  async function signIn() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        // 'email' makes Microsoft return the address the account is matched on.
        scopes: 'email openid profile',
        // Back to the login page: on success GuestRoute moves on into the app; on failure the
        // error is in the URL and shown below.
        redirectTo: `${window.location.origin}/login`,
      },
    })
    // On success the browser is already navigating to Microsoft.
    if (error) {
      setError(error.message)
      setBusy(false)
    }
  }

  return (
    <div className="sso">
      <button type="button" className="button-secondary sso-button" onClick={signIn} disabled={busy}>
        <MicrosoftLogo />
        {busy ? t('common.loading') : t('login.microsoft')}
      </button>
      <Alert kind="error" message={error} />
      <div className="sso-divider" role="separator">
        <span>{t('login.or')}</span>
      </div>
    </div>
  )
}

/**
 * Supabase sends a failed sign-in back as ?error_description=… or ?error=… (or in the #hash). Read it
 * once and clean the URL, so a refresh doesn't show the error again.
 */
function oauthErrorFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const message =
    params.get('error_description') ?? hash.get('error_description') ?? params.get('error') ?? hash.get('error')
  if (!message) return null
  window.history.replaceState(null, '', window.location.pathname)
  return t('login.microsoftFailed', { message: message.replace(/\+/g, ' ') })
}

function MicrosoftLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  )
}
