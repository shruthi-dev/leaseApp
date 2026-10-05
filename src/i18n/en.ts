// English strings. Add new locales as files exporting the same shape (see index.ts).
export const en = {
  appName: 'Lease Abstraction',
  common: {
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Confirm password',
    loading: 'Loading…',
    signOut: 'Sign out',
    passwordsDontMatch: 'Passwords do not match.',
    passwordTooShort: 'Password must be at least {min} characters.',
  },
  nav: {
    dashboard: 'Dashboard',
  },
  login: {
    title: 'Log in',
    submit: 'Log in',
    forgot: 'Forgot password?',
    noAccount: 'No account yet?',
    signUpLink: 'Sign up',
  },
  signup: {
    title: 'Create account',
    submit: 'Sign up',
    haveAccount: 'Already have an account?',
    logInLink: 'Log in',
    checkEmail: 'Check your email to confirm your account, then log in.',
  },
  forgot: {
    title: 'Reset your password',
    intro: 'Enter your email and we will send you a link to reset your password.',
    submit: 'Send reset link',
    sent: 'If an account exists for that email, a reset link is on its way.',
    back: 'Back to log in',
  },
  reset: {
    title: 'Choose a new password',
    newPassword: 'New password',
    submit: 'Update password',
    invalidLink: 'This reset link is invalid or has expired. Request a new one.',
    requestNew: 'Request a new link',
  },
  dashboard: {
    title: 'Dashboard',
    welcome: 'Signed in as {email}.',
    placeholder: 'Lease upload and the dashboard arrive in the next phases.',
  },
  notFound: {
    title: 'Page not found',
    home: 'Go home',
  },
}

/** Same shape as `en`, with every leaf a string. Other locales must satisfy this. */
type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> }
export type Messages = Widen<typeof en>
