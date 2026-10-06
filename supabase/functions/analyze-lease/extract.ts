import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'

export const MODEL = 'claude-opus-5-5'

/** A failure with a stable code the app translates for the user; message keeps the detail. */
export class AnalysisError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

/** Roughly 500k tokens; far above any normal lease, below the model's 1M context. */
export const MAX_INPUT_CHARS = 2_000_000

/** Every extracted value carries where it came from, so users can verify it. */
const evidence = {
  page: z.number().int().nullable().describe('1-based page number where the value appears, or null if not found'),
  quote: z
    .string()
    .nullable()
    .describe('Exact sentence or clause from the lease (verbatim, at most ~200 characters) that states the value; null if not found'),
  derived: z
    .boolean()
    .describe('true only if the value is NOT written in the lease and you calculated or converted it (e.g. monthly from annual rent, expiration from term length)'),
}

const textField = (description: string) =>
  z.object({ value: z.string().nullable().describe(description), ...evidence })

const dateField = z.object({
  value: z.string().nullable().describe('Date in YYYY-MM-DD format, or null if not determinable from the lease'),
  ...evidence,
})

const amountField = z.object({
  value: z.number().nullable().describe('Plain number without currency symbols or separators, or null if not found'),
  ...evidence,
})

export const LeaseTermsSchema = z.object({
  landlord: textField('Legal name of the landlord / lessor only'),
  tenant: textField('Legal name of the tenant / lessee only'),
  premises_address: textField('Street address of the leased premises only, e.g. "3100 River Drive, Miami FL 33142"'),
  premises: textField('Description of the leased premises: suite/floor, approximate area, permitted use'),
  commencement_date: dateField.describe('Date the lease term commences'),
  expiration_date: dateField.describe('Date the lease term expires'),
  monthly_rent: amountField.describe('Base rent per month at commencement'),
  currency: z.string().nullable().describe('ISO 4217 currency code of the rent and deposit, e.g. USD, or null'),
  security_deposit: amountField.describe('Security deposit amount'),
  renewal_options: textField('Concise description of renewal / extension options, or null if none'),
  summary: z.string().describe('3-5 sentence plain-English summary of the lease and its most important terms'),
})

export type LeaseTerms = z.infer<typeof LeaseTermsSchema>

const SYSTEM_PROMPT = `You are a commercial real estate paralegal who abstracts leases.
You receive the text of a lease, split into pages marked <page number="N">. Extract the requested key terms.

- Report only what the document supports. If a term is absent or ambiguous, return null rather than guessing.
- Party names are the legal name only. Leave out addresses, roles and descriptors: for
  'Acme LLC, located at 1 Main St ("Tenant")' the tenant is 'Acme LLC'.
- premises_address is just the street address of the leased space; put suite, size and use in premises.
- For each value give the page and a verbatim quote of the sentence that states it.
- Prefer values the lease states outright. Only calculate a value (monthly rent from an annual figure, or an
  expiration date from a commencement date plus a term length) when the lease does not state it directly; then
  set derived to true and quote the clause you calculated from.
- Dates must be YYYY-MM-DD. If the lease defines a date only relative to an undated event, return null.
- The text was extracted from a PDF and may contain broken lines, headers, and footers; read through them.`

export function buildLeaseDocument(pages: { page_number: number; text: string }[]): string {
  return pages.map((p) => `<page number="${p.page_number}">\n${p.text}\n</page>`).join('\n\n')
}

/** Sends the lease text to Claude and returns the validated key terms. */
export function extractLeaseTerms(apiKey: string, leaseDocument: string): Promise<LeaseTerms> {
  return askClaude(
    apiKey,
    LeaseTermsSchema,
    SYSTEM_PROMPT,
    `<lease>\n${leaseDocument}\n</lease>\n\nExtract the key terms from this lease.`,
  )
}

// ---------- Amendments ----------

/** Each term can be changed by an amendment; value null means "not changed by this amendment". */
export const AmendmentSchema = z.object({
  title: z.string().nullable().describe('Title of the amendment as written, e.g. "First Amendment to Lease"'),
  effective_date: dateField.describe('Date the amendment takes effect (or is signed, if no effective date is stated)'),
  summary: z.string().describe('2-4 sentence plain-English summary of what this amendment changes'),
  landlord: textField('New landlord legal name, only if the amendment changes the landlord (e.g. assignment)'),
  tenant: textField('New tenant legal name, only if the amendment changes the tenant'),
  premises_address: textField('New street address of the premises, only if relocated or changed'),
  premises: textField('New description of the premises, only if expanded, reduced or changed'),
  commencement_date: dateField.describe('New commencement date, only if changed'),
  expiration_date: dateField.describe('New expiration date, only if the term is extended, shortened or changed'),
  monthly_rent: amountField.describe('New base rent per month, only if changed'),
  currency: z.string().nullable().describe('ISO 4217 code of any new amounts, or null'),
  security_deposit: amountField.describe('New security deposit amount, only if changed'),
  renewal_options: textField('New renewal options, only if added, removed or changed'),
})

export type AmendmentTerms = z.infer<typeof AmendmentSchema>

const AMENDMENT_PROMPT = `You are a commercial real estate paralegal who abstracts lease amendments.
You receive the current key terms of a lease and the text of an amendment to it, split into pages marked
<page number="N">. Identify what the amendment changes.

- For each term, give a value ONLY if this amendment changes it; otherwise return value null.
  Restating an unchanged term is not a change.
- Give the new value as it stands after the amendment, not the difference. If the amendment says
  "extend the term by 3 years", compute the new expiration date from the current one, set derived to true,
  and quote the extension clause.
- For each changed value give the page and a verbatim quote of the sentence that makes the change.
- Party names are the legal name only, with no addresses or descriptors.
- Dates must be YYYY-MM-DD. Amounts are plain numbers. Report only what the document supports.`

export function extractAmendmentTerms(
  apiKey: string,
  amendmentDocument: string,
  currentTerms: Record<string, unknown>,
): Promise<AmendmentTerms> {
  return askClaude(
    apiKey,
    AmendmentSchema,
    AMENDMENT_PROMPT,
    `<current_lease_terms>\n${JSON.stringify(currentTerms, null, 2)}\n</current_lease_terms>\n\n` +
      `<amendment>\n${amendmentDocument}\n</amendment>\n\nIdentify what this amendment changes.`,
  )
}

// ---------- Shared Claude call ----------

async function askClaude<S extends z.ZodType>(
  apiKey: string,
  schema: S,
  system: string,
  content: string,
): Promise<z.infer<S>> {
  const client = new Anthropic({ apiKey })

  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    // If the model declines, the API retries the request on a fallback model it picks.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: {
      effort: 'medium',
      format: betaZodOutputFormat(schema),
    },
    system,
    messages: [{ role: 'user', content }],
  })

  if (response.stop_reason === 'refusal') {
    throw new AnalysisError('claude_refused', 'Claude declined to analyze this document.')
  }
  if (response.stop_reason === 'max_tokens') {
    throw new AnalysisError('claude_incomplete', 'Claude ran out of output tokens before finishing.')
  }
  if (!response.parsed_output) {
    throw new AnalysisError('claude_bad_output', 'Claude returned a response that did not match the expected format.')
  }
  return response.parsed_output as z.infer<S>
}
