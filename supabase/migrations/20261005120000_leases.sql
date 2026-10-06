-- Leases: one row per uploaded PDF, holding processing status and the abstracted key terms.
-- lease_pages: the text of each PDF page, extracted in the browser.

create table public.leases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,

  file_name text not null,
  file_size bigint,
  file_path text,               -- storage path in the "leases" bucket; null until the upload succeeds
  page_count integer,

  -- uploading -> extracting -> extracted -> analyzing -> completed, or failed at any step
  status text not null default 'uploading'
    check (status in ('uploading', 'extracting', 'extracted', 'analyzing', 'completed', 'failed')),
  error_message text,

  -- Abstracted key terms
  landlord text,
  tenant text,
  premises text,
  commencement_date date,
  expiration_date date,
  monthly_rent numeric(14, 2),
  currency text,
  security_deposit numeric(14, 2),
  renewal_options text,
  summary text,
  -- Page number each value was found on, keyed by field name, e.g. {"tenant": 1, "monthly_rent": 4}
  source_pages jsonb not null default '{}'::jsonb,

  analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leases_user_id_created_at_idx on public.leases (user_id, created_at desc);

create table public.lease_pages (
  lease_id uuid not null references public.leases (id) on delete cascade,
  page_number integer not null check (page_number > 0),
  text text not null default '',
  primary key (lease_id, page_number)
);

-- Keep updated_at current; the app uses it to spot uploads/analyses that stalled.
create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger leases_set_updated_at
  before update on public.leases
  for each row execute function public.set_updated_at();

-- Row level security: users only ever see and change their own leases.
alter table public.leases enable row level security;
alter table public.lease_pages enable row level security;

create policy "Users can read own leases" on public.leases
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create own leases" on public.leases
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update own leases" on public.leases
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete own leases" on public.leases
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users can read pages of own leases" on public.lease_pages
  for select to authenticated
  using (exists (select 1 from public.leases l where l.id = lease_id and l.user_id = (select auth.uid())));
create policy "Users can add pages to own leases" on public.lease_pages
  for insert to authenticated
  with check (exists (select 1 from public.leases l where l.id = lease_id and l.user_id = (select auth.uid())));
create policy "Users can update pages of own leases" on public.lease_pages
  for update to authenticated
  using (exists (select 1 from public.leases l where l.id = lease_id and l.user_id = (select auth.uid())))
  with check (exists (select 1 from public.leases l where l.id = lease_id and l.user_id = (select auth.uid())));
create policy "Users can delete pages of own leases" on public.lease_pages
  for delete to authenticated
  using (exists (select 1 from public.leases l where l.id = lease_id and l.user_id = (select auth.uid())));

-- Signed-in users only; anonymous visitors get nothing.
revoke all on public.leases, public.lease_pages from anon;
grant select, insert, update, delete on public.leases, public.lease_pages to authenticated;

-- Private bucket for the PDFs. Objects live at "<user_id>/<lease_id>.pdf".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('leases', 'leases', false, 26214400, array['application/pdf'])
on conflict (id) do nothing;

create policy "Users can read own lease files" on storage.objects
  for select to authenticated
  using (bucket_id = 'leases' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users can upload own lease files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'leases' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users can update own lease files" on storage.objects
  for update to authenticated
  using (bucket_id = 'leases' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'leases' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users can delete own lease files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'leases' and (storage.foldername(name))[1] = (select auth.uid())::text);
