-- Base rent schedule, when the lease lists rent per period (a rent table or an explicit list):
-- [{ "start_date", "end_date", "period_label", "monthly_rent", "annual_rent", "rent_per_sqft",
--    "note", "page", "quote" }], in date order. Amendments that set a new schedule store it in
-- lease_amendments.changes.rent_schedule, which replaces this one in the current terms.
alter table public.leases add column rent_schedule jsonb not null default '[]'::jsonb;
