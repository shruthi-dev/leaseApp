import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { GuestRoute, ProtectedRoute } from './components/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'
import { SignupPage } from './pages/SignupPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { LeasesPage } from './pages/LeasesPage'
import { LeaseDetailPage } from './pages/LeaseDetailPage'
import { DashboardPage } from './pages/DashboardPage'
import { ReportsPage } from './pages/ReportsPage'
import { NotFoundPage } from './pages/NotFoundPage'

// Add new pages here (and to NAV_ITEMS in AppLayout). Anything under ProtectedRoute requires a session.
export const router = createBrowserRouter([
  {
    element: <GuestRoute />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <SignupPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
    ],
  },
  // Uses the recovery session the emailed link creates, so it sits outside GuestRoute.
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <Navigate to="/leases" replace /> },
          { path: '/leases', element: <LeasesPage /> },
          { path: '/leases/:id', element: <LeaseDetailPage /> },
          { path: '/dashboard', element: <DashboardPage /> },
          { path: '/reports', element: <ReportsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
