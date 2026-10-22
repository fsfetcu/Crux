-- Run once in the Crux Supabase project's SQL editor.
create table public.user_planners (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  constraint valid_planner check (coalesce((
    jsonb_typeof(data) = 'object'
    and data->>'version' = '2'
    and jsonb_typeof(data->'profiles') = 'array'
    and jsonb_array_length(data->'profiles') between 1 and 50
    and octet_length(data::text) <= 10000000
  ), false))
);

alter table public.user_planners enable row level security;
alter table public.user_planners force row level security;
revoke all on public.user_planners from anon, authenticated;
grant select, insert, update on public.user_planners to authenticated;

create policy "Read your own planner" on public.user_planners
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Create your own planner" on public.user_planners
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update your own planner" on public.user_planners
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Compare-and-save prevents an old/offline device from overwriting newer work.
-- The explicit owner argument also rejects a request queued before an account switch.
create function public.save_planner(
  p_user_id uuid, p_expected_revision bigint, p_data jsonb
) returns setof public.user_planners
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise sqlstate 'PT403' using message = 'Account does not match this planner.';
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
