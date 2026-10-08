// analyze-lease: sends a lease's (or an amendment's) extracted page text to Claude and saves the result.
// POST { "lease_id": "<uuid>" } or { "amendment_id": "<uuid>" } with the user's access token.
// Runs as that user, so RLS applies to every read and write.

import Anthropic from '@anthropic-ai/sdk'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { corsHeaders, json } from '../_shared/cors.ts'
import {
  AnalysisError,
  buildLeaseDocument,
  extractAmendmentTerms,
  extractLeaseDetails,
  extractLeaseTerms,
  type DetailPart,
  MAX_INPUT_CHARS,
  type AmendmentTerms,
  type LeaseTerms,
} from './extract.ts'

/** An "analyzing" row untouched for this long is treated as stalled and may be claimed again. */
const STALE_AFTER_MS = 5 * 60 * 1000

/** Terms that carry a value plus page/quote evidence. */
const FIELDS = [
  'landlord',
  'tenant',
  'premises_address',
  'premises',
  'commencement_date',
  'expiration_date',
  'monthly_rent',
  'security_deposit',
  'renewal_options',
] as const
type Field = (typeof FIELDS)[number]
const DATE_FIELDS = new Set<Field>(['commencement_date', 'expiration_date'])
const AMOUNT_FIELDS = new Set<Field>(['monthly_rent', 'security_deposit'])

/** A hosted secret wins; otherwise the gitignored local config.ts (absent in deploys from git). */
async function getApiKey(): Promise<string | null> {
  const fromEnv = Deno.env.get('ANTHROPIC_API_KEY')
  if (fromEnv) return fromEnv
  try {
    // Dynamic so a missing file is a runtime miss, not a bundling error.
    const config = await import('./config.ts')
    return config.ANTHROPIC_API_KEY || null
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Not signed in' }, 401)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData.user) return json({ error: 'Not signed in' }, 401)

  let body: { lease_id?: unknown; amendment_id?: unknown; parts?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    // handled below
  }
  if (typeof body.amendment_id === 'string' && body.amendment_id) return analyzeAmendment(supabase, body.amendment_id)
  if (typeof body.lease_id === 'string' && body.lease_id) {
    // parts: fetch only these (e.g. clauses an older lease lacks) and leave everything else untouched.
    const parts = Array.isArray(body.parts) ? body.parts.filter((x): x is DetailPart => x === 'clauses' || x === 'rent_schedule') : []
    return parts.length ? extractMissingParts(supabase, body.lease_id, parts) : analyzeLease(supabase, body.lease_id)
  }
  return json({ error: 'lease_id or amendment_id is required' }, 400)
})

// ---------- Leases ----------

async function analyzeLease(supabase: SupabaseClient, leaseId: string): Promise<Response> {
  const job = await claim(supabase, 'leases', leaseId, 'id, page_count, analyzed_at')
  if (job instanceof Response) return job
  const { row, fail } = job
  const started = Date.now()

  const apiKey = await getApiKey()
  if (!apiKey) return fail('api_key_missing', 'The Claude API key is not configured. See supabase/functions/analyze-lease/config.example.ts.', 500)

  const doc = await loadDocument(supabase, 'lease_pages', 'lease_id', leaseId)
  if (doc instanceof Error) return fail(doc.name, doc.message, doc.name === 'load_failed' ? 500 : 422)

  let terms: LeaseTerms
  try {
    terms = await extractLeaseTerms(apiKey, doc.text)
  } catch (err) {
    console.error('Claude request failed', err)
    const { code, message } = describeError(err)
    return fail(code, message, 502)
  }

  const pageCount = (row.page_count as number | null) ?? doc.pageCount
  const sanitized = sanitizeFields(terms, pageCount)
  const { error: saveError } = await supabase
    .from('leases')
    .update({
      ...Object.fromEntries(FIELDS.map((f) => [f, sanitized[f]?.value ?? null])),
      currency: currencyCode(terms.currency),
      summary: terms.summary,
      clauses: sanitizeClauses(terms.clauses, pageCount),
      rent_schedule: sanitizeRentSchedule(terms.rent_schedule, pageCount),
      extracted_parts: ['terms', 'clauses', 'rent_schedule'],
      analysis_ms: Date.now() - started,
      source_pages: Object.fromEntries(
        Object.entries(sanitized).flatMap(([f, e]) => (e.page !== null ? [[f, e.page]] : [])),
      ),
      evidence: Object.fromEntries(Object.entries(sanitized).map(([f, { value: _v, ...ev }]) => [f, ev])),
      status: 'completed',
      error_message: null,
      error_code: null,
      analyzed_at: new Date().toISOString(),
    })
    .eq('id', leaseId)
  if (saveError) return fail('save_failed', `Could not save the results: ${saveError.message}`, 500)

  return json({ ok: true })
}

/**
 * Fills in parts an analyzed lease is missing (clauses, rent schedule) without re-running the key
 * terms, so edits are kept. Does not change the lease's status; on failure nothing is modified.
 */
async function extractMissingParts(supabase: SupabaseClient, leaseId: string, parts: DetailPart[]): Promise<Response> {
  const { data: lease, error } = await supabase
    .from('leases')
    .select('id, status, analyzed_at, page_count, extracted_parts')
    .eq('id', leaseId)
    .maybeSingle()
  if (error) return json({ error: error.message, code: 'load_failed' }, 500)
  if (!lease) return json({ error: 'Not found' }, 404)
  if (!lease.analyzed_at) return json({ error: 'The lease has not been analyzed yet.' }, 409)
  if (lease.status === 'analyzing') return json({ error: 'This document is already being analyzed.' }, 409)

  const apiKey = await getApiKey()
  if (!apiKey) return json({ error: 'The Claude API key is not configured.', code: 'api_key_missing' }, 500)
  const doc = await loadDocument(supabase, 'lease_pages', 'lease_id', leaseId)
  if (doc instanceof Error) return json({ error: doc.message, code: doc.name }, doc.name === 'load_failed' ? 500 : 422)

  let found: Awaited<ReturnType<typeof extractLeaseDetails>>
  try {
    found = await extractLeaseDetails(apiKey, doc.text, parts)
  } catch (err) {
    console.error('Claude request failed', err)
    const { code, message } = describeError(err)
    return json({ error: message, code }, 502)
  }

  const pageCount = (lease.page_count as number | null) ?? doc.pageCount
  const update: Record<string, unknown> = {
    extracted_parts: [...new Set([...((lease.extracted_parts as string[]) ?? []), ...parts])],
  }
  if (found.clauses) update.clauses = sanitizeClauses(found.clauses, pageCount)
  if (found.rent_schedule) update.rent_schedule = sanitizeRentSchedule(found.rent_schedule, pageCount)
  const { error: saveError } = await supabase.from('leases').update(update).eq('id', leaseId)
  if (saveError) return json({ error: `Could not save the results: ${saveError.message}`, code: 'save_failed' }, 500)
  return json({ ok: true })
}

// ---------- Amendments ----------

async function analyzeAmendment(supabase: SupabaseClient, amendmentId: string): Promise<Response> {
  const job = await claim(supabase, 'lease_amendments', amendmentId, 'id, lease_id, page_count, created_at, analyzed_at')
  if (job instanceof Response) return job
  const { row, fail } = job
  const started = Date.now()

  const apiKey = await getApiKey()
  if (!apiKey) return fail('api_key_missing', 'The Claude API key is not configured. See supabase/functions/analyze-lease/config.example.ts.', 500)

  const doc = await loadDocument(supabase, 'amendment_pages', 'amendment_id', amendmentId)
  if (doc instanceof Error) return fail(doc.name, doc.message, doc.name === 'load_failed' ? 500 : 422)

  const current = await currentTerms(supabase, row.lease_id as string, amendmentId)
  if (current instanceof Error) return fail('load_failed', current.message, 500)

  let terms: AmendmentTerms
  try {
    terms = await extractAmendmentTerms(apiKey, doc.text, current)
  } catch (err) {
    console.error('Claude request failed', err)
    const { code, message } = describeError(err)
    return fail(code, message, 502)
  }

  const pageCount = (row.page_count as number | null) ?? doc.pageCount
  const changes: Record<string, unknown> = sanitizeFields(terms, pageCount)
  const currency = currencyCode(terms.currency)
  if (currency && currency !== current.currency) changes.currency = { value: currency, page: null, quote: null, derived: false }
  // A new rent schedule replaces the current one (stored like any other changed term).
  const schedule = sanitizeRentSchedule(terms.rent_schedule, pageCount)
  if (schedule.length) {
    changes.rent_schedule = { value: schedule, page: schedule[0].page, quote: schedule[0].quote, derived: false }
  }

  const { error: saveError } = await supabase
    .from('lease_amendments')
    .update({
      title: terms.title?.trim() || null,
      effective_date: isoDate(terms.effective_date.value),
      summary: terms.summary,
      changes,
      analysis_ms: Date.now() - started,
      status: 'completed',
      error_message: null,
      error_code: null,
      analyzed_at: new Date().toISOString(),
    })
    .eq('id', amendmentId)
  if (saveError) return fail('save_failed', `Could not save the results: ${saveError.message}`, 500)

  return json({ ok: true })
}

/**
 * The lease's terms as they stand before this amendment: original values with every other
 * completed amendment applied in effective-date order (same rule as the app's applyAmendments).
 */
async function currentTerms(
  supabase: SupabaseClient,
  leaseId: string,
  excludeAmendmentId: string,
): Promise<Record<string, unknown> | Error> {
  const { data: lease, error } = await supabase
    .from('leases')
    .select([...FIELDS, 'currency', 'rent_schedule'].join(', '))
    .eq('id', leaseId)
    .single()
  if (error) return new Error(error.message)

  const { data: amendments, error: amendError } = await supabase
    .from('lease_amendments')
    .select('changes, effective_date, created_at')
    .eq('lease_id', leaseId)
    .eq('status', 'completed')
    .neq('id', excludeAmendmentId)
    .order('effective_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
  if (amendError) return new Error(amendError.message)

  const terms: Record<string, unknown> = { ...(lease as unknown as Record<string, unknown>) }
  for (const a of amendments ?? []) {
    for (const [field, change] of Object.entries((a.changes ?? {}) as Record<string, { value: unknown }>)) {
      if (change?.value !== null && change?.value !== undefined) terms[field] = change.value
    }
  }
  return terms
}

// ---------- Shared steps ----------

type Fail = (code: string, message: string, status: number) => Promise<Response>

/** Marks the row as analyzing so two analyses of the same document can't run at once. */
async function claim(
  supabase: SupabaseClient,
  table: 'leases' | 'lease_amendments',
  id: string,
  columns: string,
): Promise<{ row: Record<string, unknown>; fail: Fail } | Response> {
  const staleBefore = new Date(Date.now() - STALE_AFTER_MS).toISOString()
  const { data: row, error } = await supabase
    .from(table)
    .update({ status: 'analyzing', error_message: null, error_code: null })
    .eq('id', id)
    .or(`status.neq.analyzing,updated_at.lt."${staleBefore}"`)
    .select(columns)
    .maybeSingle()

  if (error) return json({ error: error.message }, 500)
  if (!row) {
    const { data: existing } = await supabase.from(table).select('id').eq('id', id).maybeSingle()
    return existing ? json({ error: 'This document is already being analyzed.' }, 409) : json({ error: 'Not found' }, 404)
  }

  // code: stable key the app translates (see errors.* in src/i18n); message: technical detail.
  // A document that already has results (analyzed_at set) keeps them: it goes back to 'completed'
  // and the error is kept as a note about the failed re-run. Only a first analysis ends 'failed'.
  const hadResults = !!(row as unknown as { analyzed_at: string | null }).analyzed_at
  const fail: Fail = async (code, message, status) => {
    await supabase
      .from(table)
      .update({ status: hadResults ? 'completed' : 'failed', error_code: code, error_message: message })
      .eq('id', id)
    return json({ error: message, code, kept_previous_results: hadResults }, status)
  }
  return { row: row as unknown as Record<string, unknown>, fail }
}

/** Loads the extracted page text. Failures come back as an Error whose name is the error code. */
async function loadDocument(
  supabase: SupabaseClient,
  table: 'lease_pages' | 'amendment_pages',
  column: 'lease_id' | 'amendment_id',
  id: string,
): Promise<{ text: string; pageCount: number } | Error> {
  const coded = (code: string, message: string) => Object.assign(new Error(message), { name: code })
  const { data: pages, error } = await supabase.from(table).select('page_number, text').eq(column, id).order('page_number')
  if (error) return coded('load_failed', error.message)
  if (!pages?.some((p) => p.text.trim())) return coded('no_text', 'No text was extracted from this PDF.')
  const text = buildLeaseDocument(pages)
  if (text.length > MAX_INPUT_CHARS) return coded('too_long', 'This document is too long to analyze in one request.')
  return { text, pageCount: pages.length }
}

const isoDate = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : null)
const amount = (n: number | null) => (n !== null && Number.isFinite(n) && Math.abs(n) < 1e12 ? n : null)
const currencyCode = (c: string | null) => (c && /^[A-Za-z]{3}$/.test(c) ? c.toUpperCase() : null)

/**
 * Keeps fields that have a value Postgres will accept, each with its evidence.
 * Values that fail validation (bad date, absurd amount) are dropped rather than saved.
 */
function sanitizeFields(
  terms: Pick<LeaseTerms, Field>,
  pageCount: number,
): Partial<Record<Field, { value: string | number; page: number | null; quote: string | null; derived: boolean }>> {
  const out: ReturnType<typeof sanitizeFields> = {}
  for (const field of FIELDS) {
    const t = terms[field]
    const raw = t.value
    const value = DATE_FIELDS.has(field)
      ? isoDate(raw as string | null)
      : AMOUNT_FIELDS.has(field)
        ? amount(raw as number | null)
        : typeof raw === 'string' && raw.trim()
          ? raw.trim()
          : null
    if (value === null) continue
    const page = t.page !== null && t.page >= 1 && t.page <= pageCount ? t.page : null
    out[field] = { value, page, quote: t.quote?.trim().slice(0, 400) || null, derived: t.derived }
  }
  return out
}

/** Keeps rows with at least one amount; validates dates, amounts and pages; caps the list. */
function sanitizeRentSchedule(rows: LeaseTerms['rent_schedule'], pageCount: number) {
  return (rows ?? [])
    .slice(0, 120)
    .map((r) => ({
      start_date: isoDate(r.start_date),
      end_date: isoDate(r.end_date),
      period_label: r.period_label?.trim().slice(0, 120) || null,
      monthly_rent: amount(r.monthly_rent),
      annual_rent: amount(r.annual_rent),
      rent_per_sqft: amount(r.rent_per_sqft),
      note: r.note?.trim().slice(0, 200) || null,
      page: r.page !== null && r.page >= 1 && r.page <= pageCount ? r.page : null,
      quote: r.quote?.trim().slice(0, 400) || null,
    }))
    .filter((r) => r.monthly_rent !== null || r.annual_rent !== null || r.rent_per_sqft !== null || r.note !== null)
}

/** Keeps well-formed clauses with valid pages; caps the list so a runaway answer can't bloat the row. */
function sanitizeClauses(clauses: LeaseTerms['clauses'], pageCount: number) {
  return (clauses ?? []).slice(0, 60).map((c) => ({
    type: c.type,
    title: c.title?.trim().slice(0, 200) || null,
    summary: c.summary?.trim().slice(0, 600) || null,
    page: c.page !== null && c.page >= 1 && c.page <= pageCount ? c.page : null,
    quote: c.quote?.trim().slice(0, 400) || null,
  }))
}

function describeError(err: unknown): { code: string; message: string } {
  if (err instanceof AnalysisError) return { code: err.code, message: err.message }
  if (err instanceof Anthropic.AuthenticationError) return { code: 'api_key_rejected', message: 'The Claude API key was rejected.' }
  if (err instanceof Anthropic.RateLimitError) {
    return { code: 'rate_limited', message: 'Claude is rate limiting requests. Try again shortly.' }
  }
  if (err instanceof Anthropic.APIError) {
    return { code: 'claude_api_error', message: `Claude API error (${err.status ?? 'network'}): ${err.message}` }
  }
  return { code: 'unknown', message: err instanceof Error ? err.message : 'Unknown error while analyzing the document.' }
}
