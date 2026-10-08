// Processing metrics shown in the lease list, overview and Processing log report.

import type { Lease, LeaseField } from './leases'
import type { ProcessedDoc } from './documents'
import { getLocale } from '../i18n'

/** The key terms counted as "fields". */
export const KEY_FIELDS: LeaseField[] = [
  'tenant',
  'landlord',
  'premises_address',
  'premises',
  'commencement_date',
  'expiration_date',
  'monthly_rent',
  'security_deposit',
  'renewal_options',
]

export interface FieldCounts {
  found: number
  total: number
  /** Of the found fields, how many Claude calculated rather than read. */
  calculated: number
}

/** Counts extracted key terms on the lease passed in (the list passes current terms, after amendments). */
export function fieldCounts(lease: Lease): FieldCounts {
  const found = KEY_FIELDS.filter((f) => lease[f] !== null && lease[f] !== '')
  return {
    found: found.length,
    total: KEY_FIELDS.length,
    calculated: found.filter((f) => lease.evidence?.[f]?.derived).length,
  }
}

/** Number of clauses found, or null when clauses were never extracted for this lease. */
export function clauseCount(lease: Lease): number | null {
  if (!(lease.extracted_parts ?? []).includes('clauses')) return null
  return Array.isArray(lease.clauses) ? lease.clauses.length : 0
}

/** Sum of the recorded steps, or null when none were recorded (documents from before metrics). */
export function totalMs(doc: Pick<ProcessedDoc, 'upload_ms' | 'extraction_ms' | 'analysis_ms'>): number | null {
  const parts = [doc.upload_ms, doc.extraction_ms, doc.analysis_ms].filter((n): n is number => n !== null && n !== undefined)
  return parts.length ? parts.reduce((a, b) => a + b, 0) : null
}

/** "850 ms", "4.2 s", "1 min 5 s" in the current language's number format. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  const intl = getLocale().intl
  if (ms < 1000) return `${Math.round(ms)} ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toLocaleString(intl, { maximumFractionDigits: 1 })} s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes} min ${Math.round(seconds - minutes * 60)} s`
}
