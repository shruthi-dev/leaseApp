// Lease amendments: upload/process like a lease, and apply their changes on top of the original terms.

import { supabase } from './supabase'
import {
  LEASE_BUCKET,
  processNewDocument,
  retryDocument,
  type OnProgress,
  type ProcessedDoc,
} from './documents'
import type { Lease, LeaseField } from './leases'

export type AmendableField = LeaseField | 'currency'

export interface AmendmentChange {
  /** The value after the amendment. */
  value: string | number
  page: number | null
  quote: string | null
  /** true when Claude calculated it (e.g. "extend by 3 years") rather than reading it. */
  derived: boolean
}

export interface Amendment extends ProcessedDoc {
  lease_id: string
  user_id: string
  file_size: number | null
  title: string | null
  effective_date: string | null
  summary: string | null
  changes: Partial<Record<AmendableField, AmendmentChange>>
  analyzed_at: string | null
  created_at: string
}

/** For each amended field: the amendment that last changed it and the original lease value. */
export type AmendedFields = Partial<
  Record<AmendableField, { amendment: Amendment; change: AmendmentChange; original: string | number | null }>
>

/** Fields in display order; used when listing what an amendment changed. */
export const AMENDABLE_FIELDS: AmendableField[] = [
  'tenant',
  'landlord',
  'premises_address',
  'premises',
  'commencement_date',
  'expiration_date',
  'monthly_rent',
  'currency',
  'security_deposit',
  'renewal_options',
]

/** Effective-date order (undated last), then upload order. Later amendments win. */
export function sortAmendments(list: Amendment[]): Amendment[] {
  return [...list].sort(
    (a, b) =>
      (a.effective_date ?? '9999').localeCompare(b.effective_date ?? '9999') || a.created_at.localeCompare(b.created_at),
  )
}

/**
 * The lease's current terms: original values with each completed amendment applied in order.
 * Page references for amended fields are removed from source_pages (they point into the
 * amendment's PDF, not the lease's); the amendment's evidence replaces the lease's.
 */
export function applyAmendments(lease: Lease): Lease {
  const done = sortAmendments((lease.amendments ?? []).filter((a) => a.status === 'completed'))
  if (!done.length) return { ...lease, amended: {} }

  const current: Lease = { ...lease, source_pages: { ...lease.source_pages }, evidence: { ...lease.evidence } }
  const amended: AmendedFields = {}
  for (const amendment of done) {
    for (const field of AMENDABLE_FIELDS) {
      const change = amendment.changes?.[field]
      if (!change || change.value === null || change.value === undefined) continue
      const original = amended[field]?.original ?? (lease[field] as string | number | null)
      ;(current as unknown as Record<string, unknown>)[field] = change.value
      amended[field] = { amendment, change, original }
      if (field !== 'currency') {
        delete current.source_pages[field]
        current.evidence[field] = { page: change.page, quote: change.quote, derived: change.derived }
      }
    }
  }
  return { ...current, amended }
}

/** "First Amendment to Lease", else the file name. */
export function amendmentTitle(a: Pick<Amendment, 'title' | 'file_name'>): string {
  return a.title ?? a.file_name
}

export function uploadAmendment(lease: Pick<Lease, 'id'>, file: File, onProgress: OnProgress): Promise<string> {
  return processNewDocument(
    'amendment',
    file,
    { lease_id: lease.id },
    (row) => `${row.user_id}/${lease.id}/${row.id}.pdf`,
    onProgress,
  )
}

export function retryAmendment(amendment: Amendment, onProgress: OnProgress): Promise<void> {
  return retryDocument('amendment', amendment, onProgress)
}

export async function deleteAmendment(amendment: Amendment): Promise<void> {
  if (amendment.file_path) {
    const { error } = await supabase.storage.from(LEASE_BUCKET).remove([amendment.file_path])
    if (error) throw error
  }
  const { error } = await supabase.from('lease_amendments').delete().eq('id', amendment.id)
  if (error) throw error
}
