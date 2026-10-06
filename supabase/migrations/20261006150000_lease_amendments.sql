-- Amendments to a lease. Each is its own PDF, processed like a lease; Claude records only the
-- terms it changes. The app applies completed amendments, in effective-date order, on top of the
-- original lease terms to get the current terms.

create table public.lease_amendments (
  id uuid primary key default gen_random_uuid(),
  lease_id uuid not null references public.leases (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,

  file_name text not null,
  file_size bigint,
  file_path text,               -- "<user_id>/<lease_id>/<amendment_id>.pdf" in the "leases" bucket
  page_count integer,

  status text not null default 'uploading'
    check (status in ('uploading', 'extracting', 'extracted', 'analyzing', 'completed', 'failed')),
  error_code text,
  error_message text,

  title text,                   -- e.g. "First Amendment to Lease"
  effective_date date,
  summary text,
  -- Changed terms only: {"<field>": {"value": ..., "page": 2, "quote": "...", "derived": false}}
  changes jsonb not null default '{}'::jsonb,

  analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lease_amendments_lease_id_idx on public.lease_amendments (lease_id, effective_date);

create trigger lease_amendments_set_updated_at
  before update on public.lease_amendments
  for each row execute function public.set_updated_at();

create table public.amendment_pages (
  amendment_id uuid not null references public.lease_amendments (id) on delete cascade,
  page_number integer not null check (page_number > 0),
  text text not null default '',
  primary key (amendment_id, page_number)
);

alter table public.lease_amendments enable row level security;
alter table public.amendment_pages enable row level security;

-- Own amendments only, and only on leases the user owns.
create policy "Users can read own amendments" on public.lease_amendments
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can add amendments to own leases" on public.lease_amendments
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.leases l where l.id = lease_id and l.user_id = (select auth.uid()))
  );
create policy "Users can update own amendments" on public.lease_amendments
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.leases l where l.id = lease_id and l.user_id = (select auth.uid()))
  );
create policy "Users can delete own amendments" on public.lease_amendments
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users can read pages of own amendments" on public.amendment_pages
  for select to authenticated
  using (exists (select 1 from public.lease_amendments a where a.id = amendment_id and a.user_id = (select auth.uid())));
create policy "Users can add pages to own amendments" on public.amendment_pages
  for insert to authenticated
  with check (exists (select 1 from public.lease_amendments a where a.id = amendment_id and a.user_id = (select auth.uid())));
create policy "Users can update pages of own amendments" on public.amendment_pages
  for update to authenticated
  using (exists (select 1 from public.lease_amendments a where a.id = amendment_id and a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.lease_amendments a where a.id = amendment_id and a.user_id = (select auth.uid())));
create policy "Users can delete pages of own amendments" on public.amendment_pages
  for delete to authenticated
  using (exists (select 1 from public.lease_amendments a where a.id = amendment_id and a.user_id = (select auth.uid())));

revoke all on public.lease_amendments, public.amendment_pages from anon;
grant select, insert, update, delete on public.lease_amendments, public.amendment_pages to authenticated;

-- Storage: amendment PDFs live under the user's folder like leases, so the existing
-- "own folder" policies on storage.objects already cover them.
