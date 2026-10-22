-- Temporary transaction-only checks: no credentials, emails, or retained users.
begin;
insert into auth.users(id) values
  ('7091bb15-8572-484e-b99c-c2a15cb09001'),
  ('7091bb15-8572-484e-b99c-c2a15cb09002');

set local role authenticated;
set local request.jwt.claim.sub = '7091bb15-8572-484e-b99c-c2a15cb09001';
do $$
declare n integer; rev bigint;
begin
  select revision into rev from public.save_planner(
    '7091bb15-8572-484e-b99c-c2a15cb09001',0,
    '{"version":2,"profiles":[{"id":"transaction-only-test"}]}'::jsonb);
  if rev <> 1 then raise exception 'Own save failed'; end if;
  select count(*) into n from public.user_planners;
  if n <> 1 then raise exception 'Own read failed'; end if;
  begin
    perform public.save_planner('7091bb15-8572-484e-b99c-c2a15cb09001',0,
      '{"version":2,"profiles":[{}]}'::jsonb);
    raise exception 'Duplicate initialization was accepted';
  exception when sqlstate 'PT409' then null; end;
  select revision into rev from public.save_planner(
    '7091bb15-8572-484e-b99c-c2a15cb09001',1,
    '{"version":2,"profiles":[{"id":"transaction-only-test"}]}'::jsonb);
  if rev <> 2 then raise exception 'Revision increment failed'; end if;
  begin
    perform public.save_planner('7091bb15-8572-484e-b99c-c2a15cb09001',1,
      '{"version":2,"profiles":[{}]}'::jsonb);
    raise exception 'Stale save was accepted';
  exception when sqlstate 'PT409' then null; end;
  begin
    update public.user_planners set user_id='7091bb15-8572-484e-b99c-c2a15cb09002';
    raise exception 'Ownership transfer was accepted';
  exception when insufficient_privilege then null; end;
end $$;

set local request.jwt.claim.sub = '7091bb15-8572-484e-b99c-c2a15cb09002';
do $$
declare n integer;
begin
  select count(*) into n from public.user_planners;
  if n <> 0 then raise exception 'Another account could read planner'; end if;
  update public.user_planners set revision=99;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'Another account could update planner'; end if;
  begin
    perform public.save_planner('7091bb15-8572-484e-b99c-c2a15cb09001',2,
      '{"version":2,"profiles":[{}]}'::jsonb);
    raise exception 'Wrong account request was accepted';
  exception when sqlstate 'PT403' then null; end;
  begin
    insert into public.user_planners(user_id,data) values
      ('7091bb15-8572-484e-b99c-c2a15cb09001','{"version":2,"profiles":[{}]}');
    raise exception 'Wrong account insert was accepted';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.user_planners;
    raise exception 'Anonymous read was accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_planner('7091bb15-8572-484e-b99c-c2a15cb09001',0,
      '{"version":2,"profiles":[{}]}'::jsonb);
    raise exception 'Anonymous write was accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: own save/read, revision conflicts, account isolation and anonymous denial. Test users and rows rolled back.' as verification;
