import { getLocale, t, type MessageKey } from '../i18n'
import { errorMessage } from './errors'
import { LeaseError } from './documents'

/**
 * User-facing text for a lease failure, in the current language. Known codes are translated;
 * anything else (network or database errors) falls back to the technical message.
 */
export function leaseErrorText(code: string | null | undefined, message: string | null | undefined): string {
  if (code && code in getLocale().messages.errors) {
    return t(`errors.${code}` as MessageKey, { detail: message ?? '' })
  }
  return message ?? t('errors.unknown', { detail: '' })
}

export function describeLeaseError(err: unknown): string {
  return err instanceof LeaseError ? leaseErrorText(err.code, err.message) : errorMessage(err)
}
