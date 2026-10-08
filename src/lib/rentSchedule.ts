// Base rent schedule extracted from a lease (leases.rent_schedule).

export interface RentPeriod {
  start_date: string | null
  end_date: string | null
  /** The period as written in the lease, e.g. "Months 13-24". */
  period_label: string | null
  monthly_rent: number | null
  annual_rent: number | null
  rent_per_sqft: number | null
  /** e.g. "rent abated" */
  note: string | null
  page: number | null
  quote: string | null
}

export function hasRentSchedule(schedule: unknown): schedule is RentPeriod[] {
  return Array.isArray(schedule) && schedule.length > 0
}

/** Monthly amount for a period, derived from the annual amount when only that is stated. */
export function monthlyOf(p: RentPeriod): number | null {
  if (p.monthly_rent !== null) return p.monthly_rent
  return p.annual_rent !== null ? Math.round((p.annual_rent / 12) * 100) / 100 : null
}

/** The period that covers `today` (YYYY-MM-DD), if the schedule has dates. */
export function currentPeriod(schedule: RentPeriod[], today: string): RentPeriod | null {
  return (
    schedule.find((p) => p.start_date !== null && p.start_date <= today && (p.end_date === null || today <= p.end_date)) ??
    null
  )
}
