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

/** One period of a rent schedule, as listed in the document. */
const rentPeriod = z.object({
  start_date: z.string().nullable().describe('First day of the period, YYYY-MM-DD; null if only stated relatively and not determinable'),
  end_date: z.string().nullable().describe('Last day of the period, YYYY-MM-DD; null if open-ended or not determinable'),
  period_label: z.string().nullable().describe('The period as written in the lease, e.g. "Months 1-12" or "Lease Year 2"'),
  monthly_rent: z.number().nullable().describe('Monthly base rent for the period, plain number'),
  annual_rent: z.number().nullable().describe('Annual base rent for the period, plain number'),
  rent_per_sqft: z.number().nullable().describe('Rent per square foot (or square metre) per year if stated, plain number'),
  note: z.string().nullable().describe('Anything notable about the period, e.g. "rent abated" or "free rent"; null if none'),
  page: z.number().int().nullable().describe('1-based page where this row appears'),
  quote: z.string().nullable().describe('The row or sentence as written (verbatim, at most ~200 characters)'),
})

const rentScheduleField = z
  .array(rentPeriod)
  .describe(
    'Base rent schedule ONLY if the document lists rent per period (a rent table or an explicit list of periods and amounts), in date order. Empty array if the document does not list one; do not compute a schedule from an escalation percentage.',
  )

/** Clause categories Claude may assign. Keep in sync with CLAUSE_TYPES in src/lib/clauses.ts. */
export const CLAUSE_TYPES = [
  'rent_and_escalation',
  'operating_expenses',
  'security_deposit',
  'renewal_option',
  'termination',
  'assignment_subletting',
  'permitted_use',
  'maintenance_repairs',
  'alterations',
  'insurance',
  'indemnity',
  'default_remedies',
  'holdover',
  'right_of_first_refusal',
  'exclusivity',
  'subordination',
  'environmental',
  'force_majeure',
  'guaranty',
  'governing_law',
  'notices',
  'other',
] as const

const clausesField = z
  .array(
    z.object({
      type: z.enum(CLAUSE_TYPES).describe('Category of the clause'),
      title: z.string().describe('Heading or short name of the clause as it appears in the lease, e.g. "12. ASSIGNMENT AND SUBLETTING"'),
      summary: z.string().describe('One or two plain-English sentences on what the clause says'),
      page: z.number().int().nullable().describe('1-based page where the clause starts'),
      quote: z.string().nullable().describe('Short verbatim excerpt (at most ~200 characters) from the clause'),
    }),
  )
  .describe('Notable clauses present in the lease, one entry per clause, in document order')

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
  clauses: clausesField,
})

/** Asked in a separate request: one combined form is too large for structured output. */
export const RentScheduleSchema = z.object({ rent_schedule: rentScheduleField })

/** Clauses on their own, for fetching only what an older lease is missing. */
export const ClausesSchema = z.object({ clauses: clausesField })

export type LeaseTerms = z.infer<typeof LeaseTermsSchema> & z.infer<typeof RentScheduleSchema>

const CLAUSES_RULE = `In clauses, list the substantive clauses the lease actually contains (rent, expenses, use, maintenance,
  insurance, assignment, default, renewal, termination and similar), in document order. Skip boilerplate such as
  definitions, counterparts and signature blocks. Use type "other" only when no category fits.`

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
- The text was extracted from a PDF and may contain broken lines, headers, and footers; read through them.
- ${CLAUSES_RULE}`

const CLAUSES_PROMPT = `You are a commercial real estate paralegal. You receive the text of a lease, split into pages
marked <page number="N">. List its notable clauses with the page and a short verbatim excerpt for each.

- ${CLAUSES_RULE}
- The text was extracted from a PDF and may contain broken lines, headers, and footers; read through them.`

const RENT_SCHEDULE_PROMPT = `You are a commercial real estate paralegal. You receive the text of a lease or lease
amendment, split into pages marked <page number="N">. Extract its base rent schedule.

- Copy every row of a rent table, or of an explicit list of rent periods and amounts, in date order.
- Only use what the document lists. If it states only an escalation rule (for example "3% per year") without
  listing the periods, return an empty array. Do not compute a schedule.
- Convert relative periods ("Months 13-24", "Lease Year 2") to dates when the commencement date is known;
  keep the original wording in period_label.
- If the document gives only monthly or only annual amounts, fill that one and leave the other null.
- Dates must be YYYY-MM-DD; amounts are plain numbers. Give each row's page and a short verbatim quote.
- The text was extracted from a PDF, so table rows may be split across lines; read through that.
- Return an empty array when the document has no rent schedule.`

export function buildLeaseDocument(pages: { page_number: number; text: string }[]): string {
  return pages.map((p) => `<page number="${p.page_number}">\n${p.text}\n</page>`).join('\n\n')
}

/**
 * Sends the lease text to Claude and returns the key terms, clauses and rent schedule. Two requests
 * run in parallel (key terms + clauses, and the rent schedule) because one combined form exceeds the
 * size limit for structured output ("compiled grammar is too large").
 */
export async function extractLeaseTerms(apiKey: string, leaseDocument: string): Promise<LeaseTerms> {
  const [terms, rent_schedule] = await Promise.all([
    askClaude(
      apiKey,
      LeaseTermsSchema,
      SYSTEM_PROMPT,
      `<lease>\n${leaseDocument}\n</lease>\n\nExtract the key terms from this lease.`,
    ),
    extractRentSchedule(apiKey, leaseDocument, 'lease'),
  ])
  return { ...terms, rent_schedule }
}

export type DetailPart = 'clauses' | 'rent_schedule'

/** Extracts only the requested parts (used to fill in what older leases are missing). */
export async function extractLeaseDetails(
  apiKey: string,
  leaseDocument: string,
  parts: DetailPart[],
): Promise<Partial<Pick<LeaseTerms, 'clauses' | 'rent_schedule'>>> {
  const [clauses, rent_schedule] = await Promise.all([
    parts.includes('clauses')
      ? askClaude(apiKey, ClausesSchema, CLAUSES_PROMPT, `<lease>\n${leaseDocument}\n</lease>\n\nList the notable clauses of this lease.`).then(
          (a) => a.clauses,
        )
      : undefined,
    parts.includes('rent_schedule') ? extractRentSchedule(apiKey, leaseDocument, 'lease') : undefined,
  ])
  return { ...(clauses && { clauses }), ...(rent_schedule && { rent_schedule }) }
}

async function extractRentSchedule(apiKey: string, document: string, kind: 'lease' | 'amendment') {
  const answer = await askClaude(
    apiKey,
    RentScheduleSchema,
    RENT_SCHEDULE_PROMPT,
    `<${kind}>\n${document}\n</${kind}>\n\nExtract the rent schedule, if this document has one.`,
  )
  return answer.rent_schedule
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

/** rent_schedule: a new schedule listed in the amendment (it replaces the current one), else empty. */
export type AmendmentTerms = z.infer<typeof AmendmentSchema> & z.infer<typeof RentScheduleSchema>

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

export async function extractAmendmentTerms(
  apiKey: string,
  amendmentDocument: string,
  currentTerms: Record<string, unknown>,
): Promise<AmendmentTerms> {
  const [terms, rent_schedule] = await Promise.all([
    askClaude(
      apiKey,
      AmendmentSchema,
      AMENDMENT_PROMPT,
      `<current_lease_terms>\n${JSON.stringify(currentTerms, null, 2)}\n</current_lease_terms>\n\n` +
        `<amendment>\n${amendmentDocument}\n</amendment>\n\nIdentify what this amendment changes.`,
    ),
    extractRentSchedule(apiKey, amendmentDocument, 'amendment'),
  ])
  return { ...terms, rent_schedule }
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
