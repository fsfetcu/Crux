-- Keep day-specific planned loads in the private calendar projection.
begin;
alter table crux_private.calendar_subscriptions drop constraint calendar_subscriptions_profile_id_check;
alter table crux_private.calendar_subscriptions add constraint calendar_subscriptions_profile_id_check check (length(profile_id) between 1 and 200);
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

commit;
