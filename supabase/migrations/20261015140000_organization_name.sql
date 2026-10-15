-- The organization's name (the app is one organization). A single row; everyone signed in can
-- read it, only admins can rename it (Settings → Organization).

create table public.organization (
  id boolean primary key default true check (id),  -- always true: at most one row
  name text not null default 'My organization' check (length(trim(name)) between 1 and 80),
  updated_at timestamptz not null default now()
);

insert into public.organization (id) values (true) on conflict (id) do nothing;

alter table public.organization enable row level security;

create policy "Signed-in users can read the organization" on public.organization
  for select to authenticated using (true);
create policy "Admins can rename the organization" on public.organization
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on public.organization from anon, authenticated;
grant select on public.organization to authenticated;
grant update (name, updated_at) on public.organization to authenticated;
