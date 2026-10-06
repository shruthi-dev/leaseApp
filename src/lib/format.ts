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

export function initials(email: string | undefined): string {
  if (!email) return '?'
  const name = email.split('@')[0]
  const parts = name.split(/[._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || name[0].toUpperCase()
}
