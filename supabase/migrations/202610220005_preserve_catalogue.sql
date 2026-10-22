-- Preserve a personal catalogue when an older cached client omits the new field.
begin;
create or replace function public.save_planner(
  p_user_id uuid, p_expected_revision bigint, p_data jsonb
) returns setof public.user_planners
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or auth.uid() <> p_user_id or not crux_private.has_access() then
    raise sqlstate 'PT403' using message = 'This account does not have access to Crux.';
  end if;
  if p_expected_revision = 0 then
    return query insert into public.user_planners(user_id, data)
      values (p_user_id, p_data) on conflict (user_id) do nothing returning *;
  else
    return query update public.user_planners
      set data = case
        when user_planners.data ? 'catalogue' and not (p_data ? 'catalogue')
          then jsonb_set(p_data, '{catalogue}', user_planners.data->'catalogue')
        else p_data end,
        revision = revision + 1, updated_at = clock_timestamp()
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
