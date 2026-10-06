-- Short street address of the premises (the "premises" column keeps the full description),
-- and per-field evidence so users can verify every extracted value against the document.

alter table public.leases
  add column premises_address text,
  -- {"<field>": {"page": 1, "quote": "exact sentence from the lease", "derived": false}}
  -- derived = true when the value was calculated (e.g. annual rent / 12) rather than stated.
  add column evidence jsonb not null default '{}'::jsonb;
