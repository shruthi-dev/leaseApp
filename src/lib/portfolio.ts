// Portfolio analytics over analyzed leases, shared by the Dashboard and Reports.
// Dates are compared as YYYY-MM-DD strings (lexicographic order = chronological order).

import type { Lease } from './leases'
import { t } from '../i18n'

/**
 * active    - commenced (or no commencement date) and not yet expired
 * upcoming  - commencement date is in the future
 * expired   - expiration date has passed
 * undated   - no expiration date was found in the lease
 */
export type LeasePhase = 'active' | 'upcoming' | 'expired' | 'undated'

/** Currency assumed when the lease didn't state one; matches formatMoney's default. */
export const DEFAULT_CURRENCY = 'USD'

export function todayIso(now = new Date()): string {
  return toIso(now)
}

export function toIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addMonths(iso: string, months: number): string {
  const d = parseIso(iso)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  // Clamp to the last day of the target month (e.g. Jan 31 + 1 month = Feb 28/29).
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, lastDay))
  return toIso(d)
}

export function daysBetween(fromIso: string, toIsoDate: string): number {
  return Math.round((parseIso(toIsoDate).getTime() - parseIso(fromIso).getTime()) / 86_400_000)
}

/** Whole months and leftover months from `from` to `to`; null if `to` is before `from`. */
export function remainingTerm(fromIso: string, toIsoDate: string): { years: number; months: number } | null {
  if (toIsoDate < fromIso) return null
  const a = parseIso(fromIso)
  const b = parseIso(toIsoDate)
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
  if (b.getDate() < a.getDate()) months -= 1
  months = Math.max(0, months)
  return { years: Math.floor(months / 12), months: months % 12 }
}

export function analyzed(leases: Lease[]): Lease[] {
  return leases.filter((l) => l.status === 'completed')
}

export function leasePhase(lease: Lease, today: string): LeasePhase {
  if (!lease.expiration_date) return 'undated'
  if (lease.expiration_date < today) return 'expired'
  if (lease.commencement_date && lease.commencement_date > today) return 'upcoming'
  return 'active'
}

/** Active leases whose expiration falls within the next `months` months. */
export function isExpiringWithin(lease: Lease, today: string, months: number): boolean {
  return leasePhase(lease, today) === 'active' && lease.expiration_date! <= addMonths(today, months)
}

/** Sums an amount per currency, e.g. { USD: 42000, EUR: 9000 }, largest first. */
export function sumByCurrency(leases: Lease[], pick: (l: Lease) => number | null): [string, number][] {
  const totals = new Map<string, number>()
  for (const lease of leases) {
    const amount = pick(lease)
    if (amount === null) continue
    const currency = lease.currency ?? DEFAULT_CURRENCY
    totals.set(currency, (totals.get(currency) ?? 0) + amount)
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1])
}

export interface PortfolioSummary {
  total: number
  active: Lease[]
  upcoming: Lease[]
  expired: Lease[]
  undated: Lease[]
  expiring12: Lease[]
  /** Monthly rent across active leases, per currency. */
  activeMonthlyRent: [string, number][]
}

export function summarize(leases: Lease[], today: string): PortfolioSummary {
  const done = analyzed(leases)
  const by = (phase: LeasePhase) => done.filter((l) => leasePhase(l, today) === phase)
  const active = by('active')
  return {
    total: done.length,
    active,
    upcoming: by('upcoming'),
    expired: by('expired'),
    undated: by('undated'),
    expiring12: sortByExpiration(active.filter((l) => isExpiringWithin(l, today, 12))),
    activeMonthlyRent: sumByCurrency(active, (l) => l.monthly_rent),
  }
}

export interface MonthBucket {
  /** YYYY-MM */
  key: string
  /** First day of the month, YYYY-MM-DD */
  start: string
  leases: Lease[]
}

/** Active leases bucketed by expiration month, for `months` months starting with the current one. */
export function expirationsByMonth(leases: Lease[], today: string, months = 12): MonthBucket[] {
  const first = `${today.slice(0, 7)}-01`
  const buckets: MonthBucket[] = Array.from({ length: months }, (_, i) => {
    const start = addMonths(first, i)
    return { key: start.slice(0, 7), start, leases: [] }
  })
  const index = new Map(buckets.map((b) => [b.key, b]))
  for (const lease of analyzed(leases)) {
    if (leasePhase(lease, today) !== 'active') continue
    index.get(lease.expiration_date!.slice(0, 7))?.leases.push(lease)
  }
  return buckets
}

export function sortByExpiration(leases: Lease[]): Lease[] {
  return [...leases].sort((a, b) => (a.expiration_date ?? '9999').localeCompare(b.expiration_date ?? '9999'))
}

/** Remaining term as "3y 4m", "Ended" once past, or a dash with no expiration date. */
export function formatTerm(today: string, expiration: string | null): string {
  const term = expiration ? remainingTerm(today, expiration) : null
  if (!term) return expiration ? t('reports.ended') : '—'
  return term.years > 0 ? t('reports.termYM', term) : t('reports.termM', term)
}
