-- Which parts of a lease have been extracted, so older leases can fetch only what they lack
-- ("Extract missing details") instead of a full re-analysis that would overwrite edited terms.
-- Parts: 'terms' (key terms + summary), 'clauses', 'rent_schedule'.
alter table public.leases add column extracted_parts text[] not null default '{}';

-- A document that already had results and then failed a re-analysis keeps its previous results:
-- it goes back to 'completed' (the error stays recorded as a note). Only first analyses stay 'failed'.
update public.leases set status = 'completed' where status = 'failed' and analyzed_at is not null;
update public.lease_amendments set status = 'completed' where status = 'failed' and analyzed_at is not null;

-- Backfill: every completed lease has terms. Leases analyzed with processing metrics recorded
-- (analysis_ms set) also had clauses extracted; rent schedules are newer than both.
update public.leases
set extracted_parts = case when analysis_ms is not null then array['terms', 'clauses'] else array['terms'] end
where status = 'completed' and extracted_parts = '{}';
