-- Portfolio sharing: an owner lets other signed-in users view all of their leases, amendments
-- and PDFs, read-only. Viewers never get insert/update/delete on the owner's rows, so editing,
-- deleting and (re)running analysis stay with the owner.

create table public.portfolio_shares (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  viewer_id uuid not null references auth.users (id) on delete cascade,
  -- Stored so each side can show who it is without reading auth.users (which the browser can't).
  owner_email text not null,
  viewer_email text not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, viewer_id),
  check (owner_id <> viewer_id)
);

-- RLS policies on the lease tables look up shares by viewer.
create index portfolio_shares_viewer_idx on public.portfolio_shares (viewer_id);

alter table public.portfolio_shares enable row level security;

-- Owners see who they share with; viewers see who shares with them.
create policy "Owners and viewers can read their shares" on public.portfolio_shares
  for select to authenticated
  using ((select auth.uid()) = owner_id or (select auth.uid()) = viewer_id);
-- Owners stop sharing; viewers can remove themselves.
create policy "Owners and viewers can remove a share" on public.portfolio_shares
  for delete to authenticated
  using ((select auth.uid()) = owner_id or (select auth.uid()) = viewer_id);
-- No insert policy: shares are only created through share_portfolio() below, which looks the
-- viewer up by email.

revoke all on public.portfolio_shares from anon, authenticated;
grant select, delete on public.portfolio_shares to authenticated;

/**
 * Shares the caller's portfolio with the user who has this email. Runs as the table owner so it
 * can look the email up in auth.users; it only ever inserts a share owned by the caller.
 * Errors (raised with these exact messages, translated by the app):
 *   user_not_found  - nobody has signed up with that email
 *   cannot_share_with_self
 *   already_shared
 */
create function public.share_portfolio(viewer_email text)
returns public.portfolio_shares
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  my_email text;
  viewer uuid;
  normalized text := lower(trim(viewer_email));
  result public.portfolio_shares;
begin
  if me is null then
    raise exception 'not_signed_in';
  end if;
  select u.email into my_email from auth.users u where u.id = me;
  select u.id into viewer from auth.users u where lower(u.email) = normalized limit 1;
  if viewer is null then
    raise exception 'user_not_found';
  end if;
  if viewer = me then
    raise exception 'cannot_share_with_self';
  end if;
  if exists (select 1 from public.portfolio_shares s where s.owner_id = me and s.viewer_id = viewer) then
    raise exception 'already_shared';
  end if;
  insert into public.portfolio_shares (owner_id, viewer_id, owner_email, viewer_email)
  values (me, viewer, my_email, normalized)
  returning * into result;
  return result;
end;
$$;

revoke all on function public.share_portfolio(text) from public, anon;
grant execute on function public.share_portfolio(text) to authenticated;

-- Read access for viewers. These are extra permissive policies alongside the "own rows" ones.

create policy "Viewers can read shared leases" on public.leases
  for select to authenticated
  using (user_id in (select s.owner_id from public.portfolio_shares s where s.viewer_id = (select auth.uid())));

create policy "Viewers can read pages of shared leases" on public.lease_pages
  for select to authenticated
  using (exists (
    select 1 from public.leases l
    join public.portfolio_shares s on s.owner_id = l.user_id
    where l.id = lease_id and s.viewer_id = (select auth.uid())
  ));

create policy "Viewers can read shared amendments" on public.lease_amendments
  for select to authenticated
  using (user_id in (select s.owner_id from public.portfolio_shares s where s.viewer_id = (select auth.uid())));

create policy "Viewers can read pages of shared amendments" on public.amendment_pages
  for select to authenticated
  using (exists (
    select 1 from public.lease_amendments a
    join public.portfolio_shares s on s.owner_id = a.user_id
    where a.id = amendment_id and s.viewer_id = (select auth.uid())
  ));

-- PDFs live at "<owner_id>/...", so a viewer may read files in the folders of owners who share.
create policy "Viewers can read shared lease files" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'leases'
    and (storage.foldername(name))[1] in (
      select s.owner_id::text from public.portfolio_shares s where s.viewer_id = (select auth.uid())
    )
  );
