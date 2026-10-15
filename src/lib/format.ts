// Display formatting shared across pages.

import { getLocale } from '../i18n'

/** Locale for Intl formatting; undefined = the browser's regional settings. */
const intlLocale = () => getLocale().intl

export function formatDate(value: string | null): string {
  if (!value) return '—'
  // Dates come from Postgres as YYYY-MM-DD; parse as local midnight, not UTC.
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(intlLocale(), { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatMoney(amount: number | null, currency: string | null): string {
  if (amount === null) return '—'
  try {
    return new Intl.NumberFormat(intlLocale(), {
      style: 'currency',
      currencyDisplay: 'narrowSymbol',
      currency: currency ?? 'USD',
      // Whole amounts without cents: $32,500 rather than $32,500.00.
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${amount.toLocaleString()} ${currency ?? ''}`.trim()
  }
}

/** Short form for headline figures: $4.2M, $860K, $9,500. */
export function formatMoneyCompact(amount: number, currency: string | null): string {
  try {
    return new Intl.NumberFormat(intlLocale(), {
      style: 'currency',
      currencyDisplay: 'narrowSymbol',
      currency: currency ?? 'USD',
      notation: amount >= 100_000 ? 'compact' : 'standard',
      minimumFractionDigits: 0,
      maximumFractionDigits: amount >= 100_000 ? 1 : 0,
    }).format(amount)
  } catch {
    return formatMoney(amount, currency)
  }
}

export function formatMonth(isoDate: string, style: 'short' | 'long' = 'short'): string {
  const [y, m] = isoDate.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(intlLocale(), { month: style, year: style === 'long' ? 'numeric' : undefined })
}

export function formatBytes(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * A readable name for a user: the name from their identity provider (e.g. Microsoft) when there is
 * one, otherwise built from the email ("shruthi.subbarao@…" → "Shruthi Subbarao").
 */
export function displayName(user: { email?: string; user_metadata?: Record<string, unknown> } | null | undefined): string {
  const meta = user?.user_metadata ?? {}
  const fromProvider = [meta.full_name, meta.name].find((v): v is string => typeof v === 'string' && v.trim() !== '')
  if (fromProvider) return fromProvider.trim()
  const local = (user?.email ?? '').split('@')[0].split('+')[0]
  const words = local.split(/[._-]+/).filter(Boolean)
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') || (user?.email ?? '')
}

/** Up to two initials from a display name ("Shruthi Subbarao" → "SS"). */
export function nameInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}

export function initials(email: string | undefined): string {
  if (!email) return '?'
  const name = email.split('@')[0]
  const parts = name.split(/[._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || name[0].toUpperCase()
}
