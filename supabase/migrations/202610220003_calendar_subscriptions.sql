-- Apply after the two account migrations. No link is enabled automatically.
begin;
create table crux_private.calendar_subscriptions (
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id text not null check (length(profile_id) between 1 and 120),
  token_hash text not null unique,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, profile_id)
);
alter table crux_private.calendar_subscriptions enable row level security;
alter table crux_private.calendar_subscriptions force row level security;
revoke all on crux_private.calendar_subscriptions from public, anon, authenticated;

create function public.calendar_subscription_status(p_profile_id text)
returns table (enabled boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not crux_private.has_access() then
    raise sqlstate 'PT403' using message = 'Calendar access denied.';
  end if;
  return query select c.enabled, c.created_at from crux_private.calendar_subscriptions c
    where c.user_id = auth.uid() and c.profile_id = p_profile_id;
end;
$$;

create function public.enable_calendar_subscription(p_profile_id text, p_token text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not crux_private.has_access() then
    raise sqlstate 'PT403' using message = 'Calendar access denied.';
  end if;
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' or not exists (
    select 1 from public.user_planners u,
      lateral jsonb_array_elements(u.data->'profiles') p
    where u.user_id = auth.uid() and p->>'id' = p_profile_id
  ) then
    raise sqlstate 'PT400' using message = 'Save this profile online before connecting its calendar.';
  end if;
  insert into crux_private.calendar_subscriptions(user_id, profile_id, token_hash)
    values (auth.uid(), p_profile_id, encode(sha256(convert_to(p_token, 'UTF8')), 'hex'))
    on conflict (user_id, profile_id) do update set
      token_hash = excluded.token_hash, enabled = true, created_at = clock_timestamp();
end;
$$;

create function public.disable_calendar_subscription(p_profile_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise sqlstate 'PT403' using message = 'Calendar access denied.';
  end if;
  update crux_private.calendar_subscriptions set enabled = false
    where user_id = auth.uid() and profile_id = p_profile_id;
end;
$$;

-- Anonymous callers must know a full 256-bit token. Only its hash is stored.
-- The result deliberately excludes history, recovery, notes, projects, email,
-- account identifiers and the rest of the workout library or other profiles.
create function public.read_calendar_feed(p_token text) returns jsonb
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
          'reps', coalesce(e->>'reps', ''), 'rest', coalesce(e->>'rest', '')
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
  join auth.users account on account.id = c.user_id
  join crux_private.approved_users a on a.email = lower(account.email) and a.allowed
  cross join lateral jsonb_array_elements(u.data->'profiles') p
  where c.enabled and c.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
    and p->>'id' = c.profile_id and account.email_confirmed_at is not null
    and exists (select 1 from auth.identities i where i.user_id = account.id
      and i.provider = 'google' and lower(i.identity_data->>'email') = lower(account.email)
      and i.identity_data->>'email_verified' = 'true');
  return result;
end;
$$;

revoke all on function public.calendar_subscription_status(text) from public, anon;
revoke all on function public.enable_calendar_subscription(text, text) from public, anon;
revoke all on function public.disable_calendar_subscription(text) from public, anon;
revoke all on function public.read_calendar_feed(text) from public;
grant execute on function public.calendar_subscription_status(text),
  public.enable_calendar_subscription(text, text), public.disable_calendar_subscription(text)
  to authenticated;
grant execute on function public.read_calendar_feed(text) to anon, authenticated;
commit;
