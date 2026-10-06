import { Fragment, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import { useLocale } from './i18n'
import { router } from './routes'
import './index.css'

/** Re-mounts the UI when the language changes so every t() call picks up the new strings. */
function LocaleBoundary({ children }: { children: ReactNode }) {
  const code = useLocale()
  return <Fragment key={code}>{children}</Fragment>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <LocaleBoundary>
        <RouterProvider router={router} />
      </LocaleBoundary>
    </AuthProvider>
  </StrictMode>,
)
