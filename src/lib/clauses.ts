// Clauses Claude identifies in a lease (stored in leases.clauses).

import type { MessageKey } from '../i18n'

/** Keep in sync with CLAUSE_TYPES in supabase/functions/analyze-lease/extract.ts. */
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

export type ClauseType = (typeof CLAUSE_TYPES)[number]

export interface Clause {
  type: ClauseType
  title: string | null
  summary: string | null
  page: number | null
  quote: string | null
}

/** Translation key for a clause category (unknown types fall back to "other"). */
export function clauseTypeLabel(type: string): MessageKey {
  return `clauseTypes.${(CLAUSE_TYPES as readonly string[]).includes(type) ? type : 'other'}` as MessageKey
}
