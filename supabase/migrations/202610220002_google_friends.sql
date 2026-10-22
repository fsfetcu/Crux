-- Apply after 202610220001_accounts.sql. Add approved addresses privately in
-- Supabase, never in this repository. Configure the before-user-created hook
-- to call public.crux_before_user_created, then enable the Google provider.
begin;
create schema crux_private;
revoke all on schema crux_private from public, anon, authenticated;
grant usage on schema crux_private to authenticated, supabase_auth_admin;

create table crux_private.approved_users (
  email text primary key check (
    email = lower(btrim(email)) and length(email) <= 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  allowed boolean not null default true
);
alter table crux_private.approved_users enable row level security;
alter table crux_private.approved_users force row level security;
revoke all on crux_private.approved_users from public, anon, authenticated;
grant select on crux_private.approved_users to supabase_auth_admin;
create policy "Auth checks approved addresses" on crux_private.approved_users
  for select to supabase_auth_admin using (true);

-- A boolean check for the current account only. Neither editable user metadata
-- nor an unverified email can authorize access. Fixed search_path prevents
-- caller-controlled objects from changing the result.
create function crux_private.has_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    join crux_private.approved_users a on a.email = lower(u.email) and a.allowed
    join auth.identities i on i.user_id = u.id and i.provider = 'google'
    where u.id = (select auth.uid())
      and u.email_confirmed_at is not null
      and lower(i.identity_data->>'email') = lower(u.email)
      and i.identity_data->>'email_verified' = 'true'
  );
$$;
revoke all on function crux_private.has_access() from public, anon;
grant execute on function crux_private.has_access() to authenticated;

create function public.crux_before_user_created(event jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
  if coalesce(event->'user'->'app_metadata'->>'provider', '') <> 'google'
    or not exists (
      select 1 from crux_private.approved_users a
      where a.allowed and a.email = lower(btrim(event->'user'->>'email'))
    ) then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'This Google account is not approved for Crux. Ask the owner for access.'
    ));
  end if;
  return '{}'::jsonb;
end;
$$;
grant usage on schema public to supabase_auth_admin;
revoke all on function public.crux_before_user_created(jsonb)
  from public, anon, authenticated;
grant execute on function public.crux_before_user_created(jsonb)
  to supabase_auth_admin;

alter policy "Read your own planner" on public.user_planners
  using ((select auth.uid()) = user_id and (select crux_private.has_access()));
alter policy "Create your own planner" on public.user_planners
  with check ((select auth.uid()) = user_id and (select crux_private.has_access()));
alter policy "Update your own planner" on public.user_planners
  using ((select auth.uid()) = user_id and (select crux_private.has_access()))
  with check ((select auth.uid()) = user_id and (select crux_private.has_access()));

-- An explicit refusal keeps a revoked account's cached planner from being
-- mistaken for a brand-new empty account. Data is retained for recovery.
create function public.load_planner(p_user_id uuid)
returns setof public.user_planners
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or auth.uid() <> p_user_id
    or not crux_private.has_access() then
    raise sqlstate 'PT403' using message = 'This account does not have access to Crux.';
  end if;
  return query select * from public.user_planners where user_id = p_user_id;
end;
$$;
revoke all on function public.load_planner(uuid) from public, anon;
grant execute on function public.load_planner(uuid) to authenticated;

create or replace function public.save_planner(
  p_user_id uuid, p_expected_revision bigint, p_data jsonb
) returns setof public.user_planners
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or auth.uid() <> p_user_id
    or not crux_private.has_access() then
    raise sqlstate 'PT403' using message = 'This account does not have access to Crux.';
  end if;
  if p_expected_revision = 0 then
    return query insert into public.user_planners(user_id, data)
      values (p_user_id, p_data)
      on conflict (user_id) do nothing returning *;
  else
    return query update public.user_planners
      set data = p_data, revision = revision + 1, updated_at = clock_timestamp()
      where user_id = p_user_id and revision = p_expected_revision returning *;
  end if;
  if not found then
    raise sqlstate 'PT409' using message = 'A newer planner is already saved. Review both copies.';
  end if;
end;
$$;
revoke all on function public.save_planner(uuid, bigint, jsonb) from public, anon;
grant execute on function public.save_planner(uuid, bigint, jsonb) to authenticated;
commit;
