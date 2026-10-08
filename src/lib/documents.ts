// Shared processing pipeline for uploaded PDFs: leases and their amendments go through the same
// steps (create row → upload → extract page text in the browser → save pages → Edge Function).

import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { extractPdfPages, type ExtractedPage } from './pdf'
import { errorMessage } from './errors'

export const LEASE_BUCKET = 'leases'
export const MAX_FILE_BYTES = 25 * 1024 * 1024
/** Matches STALE_AFTER_MS in the analyze-lease function. */
const STALE_AFTER_MS = 5 * 60 * 1000

export type DocStatus = 'uploading' | 'extracting' | 'extracted' | 'analyzing' | 'completed' | 'failed'

/** digital = selectable text on (nearly) every page; scanned = none; mixed = some pages without text. */
export type PdfType = 'digital' | 'scanned' | 'mixed'

/** A page counts as having text at this many non-blank characters (page numbers alone do not). */
const MIN_PAGE_TEXT = 30
/** Share of pages with text needed to call a document digital (allows blank or signature pages). */
const DIGITAL_SHARE = 0.9

export function classifyPdf(pages: { text: string }[]): { pdf_type: PdfType; text_pages: number } {
  const text_pages = pages.filter((p) => p.text.trim().length >= MIN_PAGE_TEXT).length
  const pdf_type: PdfType =
    text_pages === 0 ? 'scanned' : text_pages >= Math.ceil(pages.length * DIGITAL_SHARE) ? 'digital' : 'mixed'
  return { pdf_type, text_pages }
}

/** The processing fields every document row has. */
export interface ProcessedDoc {
  id: string
  status: DocStatus
  updated_at: string
  file_name: string
  file_path: string | null
  page_count: number | null
  /** Stable reason for a failure; translated for display (see lib/leaseErrors.ts). */
  error_code: string | null
  /** Technical detail, in English. */
  error_message: string | null
  pdf_type: PdfType | null
  text_pages: number | null
  /** Milliseconds spent on each processing step (null when not recorded). */
  upload_ms: number | null
  extraction_ms: number | null
  analysis_ms: number | null
}

/** Progress reported while a document is being processed in this browser tab. */
export type Progress =
  | { step: 'uploading' }
  | { step: 'extracting'; page: number; total: number }
  | { step: 'analyzing' }

export type OnProgress = (id: string, p: Progress) => void

/** A failure with a code the UI can translate; message is the English detail. */
export class LeaseError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export type DocKind = 'lease' | 'amendment'

const KINDS = {
  lease: { table: 'leases', pages: 'lease_pages', fk: 'lease_id', body: (id: string) => ({ lease_id: id }) },
  amendment: {
    table: 'lease_amendments',
    pages: 'amendment_pages',
    fk: 'amendment_id',
    body: (id: string) => ({ amendment_id: id }),
  },
} as const

export function isInProgress(doc: Pick<ProcessedDoc, 'status'>): boolean {
  return doc.status !== 'completed' && doc.status !== 'failed'
}

/** In progress but untouched for a while: the tab that was processing it was probably closed. */
export function isStalled(doc: Pick<ProcessedDoc, 'status' | 'updated_at'>): boolean {
  return isInProgress(doc) && Date.now() - new Date(doc.updated_at).getTime() > STALE_AFTER_MS
}

export function canRetry(doc: Pick<ProcessedDoc, 'status' | 'updated_at'>): boolean {
  return doc.status === 'failed' || isStalled(doc)
}

export function validatePdf(file: File): 'notPdf' | 'tooLarge' | null {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!isPdf) return 'notPdf'
  if (file.size > MAX_FILE_BYTES) return 'tooLarge'
  return null
}

/**
 * Full pipeline for a new file. `values` are the extra columns for the new row; `pathFor`
 * builds its storage path (which must start with the user's id for the storage policies).
 */
export async function processNewDocument(
  kind: DocKind,
  file: File,
  values: Record<string, unknown>,
  pathFor: (row: { id: string; user_id: string }) => string,
  onProgress: OnProgress,
): Promise<string> {
  const { table } = KINDS[kind]
  const { data: row, error } = await supabase
    .from(table)
    .insert({ ...values, file_name: file.name, file_size: file.size, status: 'uploading' })
    .select('id, user_id')
    .single()
  if (error) throw error

  const id: string = row.id
  try {
    onProgress(id, { step: 'uploading' })
    const uploadStarted = performance.now()
    const path = pathFor(row)
    const { error: uploadError } = await supabase.storage
      .from(LEASE_BUCKET)
      .upload(path, file, { contentType: 'application/pdf', upsert: true })
    if (uploadError) throw uploadError
    await updateRow(kind, id, { file_path: path, status: 'extracting', upload_ms: elapsed(uploadStarted) })

    await extractAndSave(kind, id, await file.arrayBuffer(), onProgress)
    onProgress(id, { step: 'analyzing' })
    await analyzeDocument(kind, id)
    return id
  } catch (err) {
    await markFailed(kind, id, err)
    throw Object.assign(err instanceof Error ? err : new Error(errorMessage(err)), { documentId: id })
  }
}

/** Picks up from wherever processing stopped. */
export async function retryDocument(kind: DocKind, doc: ProcessedDoc, onProgress: OnProgress): Promise<void> {
  try {
    if (!doc.file_path) {
      throw new LeaseError('upload_incomplete', 'The file never finished uploading. Delete it and upload the PDF again.')
    }
    if (!doc.page_count) {
      await updateRow(kind, doc.id, { status: 'extracting', error_code: null, error_message: null })
      const { data: blob, error } = await supabase.storage.from(LEASE_BUCKET).download(doc.file_path)
      if (error) throw error
      await extractAndSave(kind, doc.id, await blob.arrayBuffer(), onProgress)
    }
    onProgress(doc.id, { step: 'analyzing' })
    await analyzeDocument(kind, doc.id)
  } catch (err) {
    await markFailed(kind, doc.id, err)
    throw err
  }
}

/** Calls the analyze-lease Edge Function, which saves the results itself. */
export async function analyzeDocument(kind: DocKind, id: string, extra: Record<string, unknown> = {}): Promise<void> {
  const { error } = await supabase.functions.invoke('analyze-lease', { body: { ...KINDS[kind].body(id), ...extra } })
  if (!error) return
  // Surface the function's own error message rather than a generic "non-2xx status".
  if (error instanceof FunctionsHttpError) {
    const body = await error.context.json().catch(() => null)
    if (body?.error) throw body.code ? new LeaseError(body.code, body.error) : new Error(body.error)
  }
  throw error
}

/** Short-lived link to a private PDF (the bucket is not public). */
export async function getFileUrl(path: string, expiresInSeconds = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from(LEASE_BUCKET).createSignedUrl(path, expiresInSeconds)
  if (error) throw error
  return data.signedUrl
}

const elapsed = (start: number) => Math.round(performance.now() - start)

async function extractAndSave(kind: DocKind, id: string, data: ArrayBuffer, onProgress: OnProgress): Promise<void> {
  const started = performance.now()
  const pages = await extractPdfPages(data, (page, total) => onProgress(id, { step: 'extracting', page, total }))
  const { pdf_type, text_pages } = classifyPdf(pages)
  if (pdf_type === 'scanned') {
    // Recorded so the list can show it as scanned, then rejected: there is no OCR yet.
    await updateRow(kind, id, { page_count: pages.length, pdf_type, text_pages, extraction_ms: elapsed(started) })
    throw new LeaseError('no_text', 'No selectable text found. This looks like a scanned PDF, and OCR is not supported yet.')
  }
  await savePages(kind, id, pages)
  await updateRow(kind, id, {
    page_count: pages.length,
    pdf_type,
    text_pages,
    extraction_ms: elapsed(started),
    status: 'extracted',
  })
}

async function savePages(kind: DocKind, id: string, pages: ExtractedPage[]): Promise<void> {
  const { pages: table, fk } = KINDS[kind]
  const BATCH = 50
  for (let i = 0; i < pages.length; i += BATCH) {
    const rows = pages.slice(i, i + BATCH).map((p) => ({ [fk]: id, ...p }))
    const { error } = await supabase.from(table).upsert(rows, { onConflict: `${fk},page_number` })
    if (error) throw error
  }
}

async function updateRow(kind: DocKind, id: string, values: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from(KINDS[kind].table).update(values).eq('id', id)
  if (error) throw error
}

async function markFailed(kind: DocKind, id: string, err: unknown): Promise<void> {
  const message = errorMessage(err)
  const code = err instanceof LeaseError ? err.code : null
  // Only browser-side steps are marked here. Once the Edge Function has claimed the row
  // (status 'analyzing') it records its own outcome, even if this request dropped.
  await supabase
    .from(KINDS[kind].table)
    .update({ status: 'failed', error_code: code, error_message: message })
    .eq('id', id)
    .in('status', ['uploading', 'extracting', 'extracted'])
}
