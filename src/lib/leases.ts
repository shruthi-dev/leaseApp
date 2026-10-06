// Lease data access. Everything goes straight to Supabase; RLS limits each user to their own rows.

import { supabase } from './supabase'
import {
  analyzeDocument,
  getFileUrl,
  LEASE_BUCKET,
  processNewDocument,
  retryDocument,
  type OnProgress,
  type ProcessedDoc,
} from './documents'
import type { AmendedFields, Amendment } from './amendments'

export {
  canRetry,
  isInProgress,
  isStalled,
  LEASE_BUCKET,
  LeaseError,
  MAX_FILE_BYTES,
  validatePdf,
  type DocStatus as LeaseStatus,
  type Progress,
} from './documents'

export type LeaseField =
  | 'landlord'
  | 'tenant'
  | 'premises_address'
  | 'premises'
  | 'commencement_date'
  | 'expiration_date'
  | 'monthly_rent'
  | 'security_deposit'
  | 'renewal_options'

/** Where an extracted value came from. derived = calculated by Claude rather than stated in the lease. */
export interface Evidence {
  page: number | null
  quote: string | null
  derived: boolean
}

export interface Lease extends ProcessedDoc {
  user_id: string
  file_size: number | null
  landlord: string | null
  tenant: string | null
  /** Short street address; premises holds the full description. */
  premises_address: string | null
  premises: string | null
  commencement_date: string | null
  expiration_date: string | null
  monthly_rent: number | null
  currency: string | null
  security_deposit: number | null
  renewal_options: string | null
  summary: string | null
  source_pages: Partial<Record<LeaseField, number>>
  evidence: Partial<Record<LeaseField, Evidence>>
  analyzed_at: string | null
  created_at: string
  /** Loaded alongside the lease. */
  amendments?: Amendment[]
  /** Set by applyAmendments: which current values come from an amendment. */
  amended?: AmendedFields
}

/** Lease row plus its amendments in one request (via the lease_amendments foreign key). */
const SELECT_WITH_AMENDMENTS = '*, amendments:lease_amendments(*)'

export async function listLeases(): Promise<Lease[]> {
  const { data, error } = await supabase
    .from('leases')
    .select(SELECT_WITH_AMENDMENTS)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Lease[]
}

export async function getLease(id: string): Promise<Lease | null> {
  const { data, error } = await supabase.from('leases').select(SELECT_WITH_AMENDMENTS).eq('id', id).maybeSingle()
  if (error) throw error
  return data as Lease | null
}

/** The fields a user can correct on the overview page (always the original lease terms). */
export type EditableTerms = Pick<
  Lease,
  | 'landlord'
  | 'tenant'
  | 'premises_address'
  | 'premises'
  | 'commencement_date'
  | 'expiration_date'
  | 'monthly_rent'
  | 'currency'
  | 'security_deposit'
  | 'renewal_options'
  | 'summary'
>

/**
 * Saves user corrections. A changed value no longer comes from the document, so its
 * page reference and quote are dropped rather than left pointing at the old text.
 */
export async function updateLeaseTerms(lease: Lease, terms: EditableTerms): Promise<Lease> {
  const source_pages = { ...lease.source_pages }
  const evidence = { ...lease.evidence }
  for (const key of Object.keys(terms) as (keyof EditableTerms)[]) {
    if (terms[key] !== lease[key] && key !== 'currency' && key !== 'summary') {
      delete source_pages[key]
      delete evidence[key]
    }
  }
  const { data, error } = await supabase
    .from('leases')
    .update({ ...terms, source_pages, evidence })
    .eq('id', lease.id)
    .select(SELECT_WITH_AMENDMENTS)
    .single()
  if (error) throw error
  return data as Lease
}

/** Short-lived link to a private PDF (the bucket is not public). */
export const getLeaseFileUrl = getFileUrl

/** Tenant once Claude has found it, otherwise the uploaded file's name. */
export function leaseTitle(lease: Pick<Lease, 'tenant' | 'file_name'>): string {
  return lease.tenant ?? lease.file_name
}

/** Creates the lease, uploads the PDF, extracts its text and has Claude analyze it. */
export function uploadLease(file: File, onProgress: OnProgress): Promise<string> {
  return processNewDocument('lease', file, {}, (row) => `${row.user_id}/${row.id}.pdf`, onProgress)
}

/** Picks up from wherever processing stopped. */
export function retryLease(lease: Lease, onProgress: OnProgress): Promise<void> {
  return retryDocument('lease', lease, onProgress)
}

/** Re-runs Claude on an already extracted lease (replaces the key terms). */
export function analyzeLease(leaseId: string): Promise<void> {
  return analyzeDocument('lease', leaseId)
}

export async function deleteLease(lease: Lease): Promise<void> {
  // The lease's own PDF plus every amendment PDF.
  const paths = [lease.file_path, ...(lease.amendments ?? []).map((a) => a.file_path)].filter((p): p is string => !!p)
  if (paths.length) {
    const { error } = await supabase.storage.from(LEASE_BUCKET).remove(paths)
    if (error) throw error
  }
  // lease_pages, lease_amendments and amendment_pages rows go with it (on delete cascade).
  const { error } = await supabase.from('leases').delete().eq('id', lease.id)
  if (error) throw error
}
