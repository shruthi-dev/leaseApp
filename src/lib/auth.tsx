import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { isAuthApiError, type Session, type User } from '@supabase/supabase-js'
import { supabase } from './supabase'

interface AuthState {
  session: Session | null
  user: User | null
  loading: boolean
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, user: null, loading: true })

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION on subscribe (after any token in the URL is
    // processed), so it alone is enough to resolve the loading state.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setState({ session, user: session?.user ?? null, loading: false })
      // A stored session is only checked locally. Confirm with the server that the user still
      // exists (e.g. after a local `supabase db reset`); deferred so it runs outside this callback.
      if (event === 'INITIAL_SESSION' && session) setTimeout(verifySession, 0)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

/** Signs out if the auth server rejects the stored session. Network errors leave it alone. */
async function verifySession() {
  const { error } = await supabase.auth.getUser()
  if (error && isAuthApiError(error) && (error.status === 401 || error.status === 403)) {
    await supabase.auth.signOut({ scope: 'local' })
  }
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export const MIN_PASSWORD_LENGTH = 6
