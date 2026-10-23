-- Open self-service Google signup while retaining private, per-account data.
-- Apply after 202610220006_catalogue_revision.sql. No user records are changed.
begin;

-- Internal check shared by own-account access and opt-in calendar feeds.
create or replace function crux_private.google_account_verified(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    join auth.identities i on i.user_id = u.id and i.provider = 'google'
    where u.id = p_user_id and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until <= now())
      and lower(i.identity_data->>'email') = lower(u.email)
      and i.identity_data->>'email_verified' = 'true'
  );
$$;
revoke all on function crux_private.google_account_verified(uuid)
  from public, anon, authenticated, supabase_auth_admin;

create or replace function crux_private.has_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select crux_private.google_account_verified((select auth.uid()));
$$;
revoke all on function crux_private.has_access() from public, anon;
grant execute on function crux_private.has_access() to authenticated;

-- Only Supabase Auth may invoke this hook. Provider metadata here comes from
-- the auth service; editable user metadata never authorizes planner access.
create or replace function public.crux_before_user_created(event jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare account_email text := btrim(event->'user'->>'email');
begin
  if coalesce(event->'user'->'app_metadata'->>'provider', '') <> 'google'
    or coalesce(event->'user'->>'is_anonymous', 'false') <> 'false'
    or account_email is null or length(account_email) > 254
    or account_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403, 'message', 'Sign in with a verified Google account to use Crux.'
    ));
  end if;
  return '{}'::jsonb;
end;
$$;
revoke all on function public.crux_before_user_created(jsonb)
  from public, anon, authenticated;
grant execute on function public.crux_before_user_created(jsonb) to supabase_auth_admin;

-- The former approved_users table remains private for historical recovery.
-- Neither signup nor planner/calendar access consults it anymore. Existing RLS
-- policies and load/save RPCs still require auth.uid() to match the record owner.
create or replace function public.read_calendar_feed(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null; end if;
  select jsonb_build_object(
    'profileId', c.profile_id, 'name', p->>'name', 'revision', u.revision,
    'updatedAt', greatest(u.updated_at, c.created_at),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', plan->>'id', 'date', plan->>'date',
        'name', case when jsonb_array_length(exercises) = 1 and plan ? 'exercises'
          then exercises->0->>'name' else template->>'name' end,
        'location', coalesce(template->>'location', ''),
        'exercises', coalesce((select jsonb_agg(jsonb_build_object(
          'name', coalesce(e->>'name', ''), 'sets', coalesce(e->>'sets', ''),
          'reps', coalesce(e->>'reps', ''), 'rest', coalesce(e->>'rest', ''),
          'weightKg', e->'weightKg'
        )) from jsonb_array_elements(exercises) e), '[]'::jsonb)
      )) from jsonb_array_elements(case when jsonb_typeof(p->'state'->'plans') = 'array'
        then p->'state'->'plans' else '[]'::jsonb end) plan
      cross join lateral (
        select t as template from jsonb_array_elements(case
          when jsonb_typeof(p->'state'->'templates') = 'array'
          then p->'state'->'templates' else '[]'::jsonb end) t
        where t->>'id' = plan->>'templateId' limit 1
      ) t
      cross join lateral (select case
        when jsonb_typeof(plan->'exercises') = 'array' then plan->'exercises'
        when jsonb_typeof(template->'exercises') = 'array' then template->'exercises'
        else '[]'::jsonb end as exercises) selected
    ), '[]'::jsonb)
  ) into result
  from crux_private.calendar_subscriptions c
  join public.user_planners u on u.user_id = c.user_id
  cross join lateral jsonb_array_elements(u.data->'profiles') p
  where c.enabled and c.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
    and p->>'id' = c.profile_id
    and crux_private.google_account_verified(c.user_id);
  return result;
end;
$$;

commit;
