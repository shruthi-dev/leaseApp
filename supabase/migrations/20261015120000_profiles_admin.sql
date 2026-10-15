-- Organization members and admins. The app is one organization: every account that signs up gets
-- a profile and is a 'member'. Admins can list every user (Settings → All users). Make someone
-- an admin with:
--   update public.profiles set role = 'admin' where email = 'someone@company.com';

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);

-- Existing accounts.
insert into public.profiles (id, email, created_at)
select u.id, coalesce(u.email, ''), u.created_at from auth.users u
on conflict (id) do nothing;

-- New accounts get a profile on sign-up, and keep its email in sync.
create function public.handle_user_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, created_at)
  values (new.id, coalesce(new.email, ''), new.created_at)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_user_change();
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_change();

/** True when the signed-in user is an admin. Security definer so policies can call it without recursion. */
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin');
$$;

alter table public.profiles enable row level security;

-- Everyone reads their own profile (to know their role); admins read all. Roles are changed in SQL only.
create policy "Users can read own profile, admins all" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

/**
 * Every user in the organization, for admins. Includes the last sign-in (from auth.users, which the
 * browser cannot read), how many leases each has, and whether the admin already shares with them.
 * Raises 'not_admin' for anyone else.
 */
create function public.list_users()
returns table (
  id uuid,
  email text,
  role text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  lease_count bigint,
  can_view_my_leases boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  return query
    select p.id, p.email, p.role, p.created_at, u.last_sign_in_at,
      (select count(*) from public.leases l where l.user_id = p.id),
      exists (select 1 from public.portfolio_shares s where s.owner_id = auth.uid() and s.viewer_id = p.id)
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at;
end;
$$;

/** The organization's admins (email only), so every member can see who to ask for access. */
create function public.list_admins()
returns table (email text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.email from public.profiles p where p.role = 'admin' order by p.created_at;
$$;

revoke all on function public.list_admins() from public, anon;
grant execute on function public.list_admins() to authenticated;
revoke all on function public.list_users() from public, anon;
grant execute on function public.list_users() to authenticated;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
