-- Run after both migrations, using the SQL editor's postgres role.
-- All fictional accounts, identities and planner records are rolled back.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
  ('7091bb15-8572-484e-b99c-c2a15cb09101','crux-test-a@example.invalid',now(),'{}'),
  ('7091bb15-8572-484e-b99c-c2a15cb09102','crux-test-b@example.invalid',now(),'{}'),
  ('7091bb15-8572-484e-b99c-c2a15cb09103','crux-test-c@example.invalid',now(),'{"approved":true,"provider":"google"}');
insert into auth.identities(id,user_id,provider,provider_id,identity_data) values
  ('7091bb15-8572-484e-b99c-c2a15cb09201','7091bb15-8572-484e-b99c-c2a15cb09101','google','crux-transaction-only-a','{"sub":"crux-transaction-only-a","email":"crux-test-a@example.invalid","email_verified":true}'),
  ('7091bb15-8572-484e-b99c-c2a15cb09202','7091bb15-8572-484e-b99c-c2a15cb09102','google','crux-transaction-only-b','{"sub":"crux-transaction-only-b","email":"crux-test-b@example.invalid","email_verified":true}'),
  ('7091bb15-8572-484e-b99c-c2a15cb09203','7091bb15-8572-484e-b99c-c2a15cb09103','google','crux-transaction-only-c','{"sub":"crux-transaction-only-c","email":"crux-test-c@example.invalid","email_verified":true}');
insert into crux_private.approved_users(email) values
  ('crux-test-a@example.invalid'),('crux-test-b@example.invalid');

set local role authenticated;
set local request.jwt.claim.sub = '7091bb15-8572-484e-b99c-c2a15cb09101';
do $$
declare n integer; rev bigint;
begin
  select revision into rev from public.save_planner(
    '7091bb15-8572-484e-b99c-c2a15cb09101',0,
    '{"version":2,"profiles":[{"id":"transaction-only-test"}]}'::jsonb);
  if rev is distinct from 1 then raise exception 'Own save failed'; end if;
  select count(*) into n from public.load_planner('7091bb15-8572-484e-b99c-c2a15cb09101');
  if n <> 1 then raise exception 'Own read failed'; end if;
  select revision into rev from public.save_planner(
    '7091bb15-8572-484e-b99c-c2a15cb09101',1,
    '{"version":2,"profiles":[{"id":"transaction-only-test"}]}'::jsonb);
  if rev is distinct from 2 then raise exception 'Revision increment failed'; end if;
  begin
    perform public.save_planner('7091bb15-8572-484e-b99c-c2a15cb09101',1,'{"version":2,"profiles":[{}]}');
    raise exception 'Stale save accepted';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform public.save_planner('7091bb15-8572-484e-b99c-c2a15cb09101',0,'{"version":2,"profiles":[{}]}');
    raise exception 'Duplicate initialization accepted';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform 1 from crux_private.approved_users;
    raise exception 'Private access list exposed';
  exception when insufficient_privilege then null; end;
  begin
    update crux_private.approved_users set allowed=true;
    raise exception 'Member could edit access list';
  exception when insufficient_privilege then null; end;
end $$;

set local request.jwt.claim.sub = '7091bb15-8572-484e-b99c-c2a15cb09102';
do $$
declare n integer;
begin
  select count(*) into n from public.user_planners;
  if n <> 0 then raise exception 'Another account could read planner'; end if;
  update public.user_planners set revision=99;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'Another account could update planner'; end if;
  begin
    perform 1 from public.load_planner('7091bb15-8572-484e-b99c-c2a15cb09101');
    raise exception 'Wrong account read accepted';
  exception when sqlstate 'PT403' then null; end;
  begin
    perform public.save_planner('7091bb15-8572-484e-b99c-c2a15cb09101',2,'{"version":2,"profiles":[{}]}');
    raise exception 'Wrong account save accepted';
  exception when sqlstate 'PT403' then null; end;
  begin
    insert into public.user_planners(user_id,data) values
      ('7091bb15-8572-484e-b99c-c2a15cb09101','{"version":2,"profiles":[{}]}');
    raise exception 'Wrong account insert accepted';
  exception when insufficient_privilege then null; end;
end $$;

set local request.jwt.claim.sub = '7091bb15-8572-484e-b99c-c2a15cb09103';
do $$
begin
  begin
    perform public.save_planner('7091bb15-8572-484e-b99c-c2a15cb09103',0,'{"version":2,"profiles":[{}]}');
    raise exception 'Unapproved account accepted';
  exception when sqlstate 'PT403' then null; end;
end $$;

reset role;
update crux_private.approved_users set allowed=false where email='crux-test-a@example.invalid';
set local role authenticated;
set local request.jwt.claim.sub = '7091bb15-8572-484e-b99c-c2a15cb09101';
do $$
declare n integer;
begin
  begin
    perform 1 from public.load_planner('7091bb15-8572-484e-b99c-c2a15cb09101');
    raise exception 'Revoked account could load';
  exception when sqlstate 'PT403' then null; end;
  begin
    perform public.save_planner('7091bb15-8572-484e-b99c-c2a15cb09101',2,'{"version":2,"profiles":[{}]}');
    raise exception 'Revoked account could save';
  exception when sqlstate 'PT403' then null; end;
  select count(*) into n from public.user_planners;
  if n <> 0 then raise exception 'Revoked account could read table'; end if;
end $$;
reset role;
do $$
begin
  if not exists(select 1 from public.user_planners where user_id='7091bb15-8572-484e-b99c-c2a15cb09101' and revision=2)
    then raise exception 'Revocation deleted planner'; end if;
end $$;
-- Hosted Supabase's postgres role cannot SET ROLE supabase_auth_admin.
-- Check the auth service's grants explicitly, then test hook decisions as owner.
do $$
begin
  if not has_function_privilege('supabase_auth_admin','public.crux_before_user_created(jsonb)','EXECUTE')
    or not has_schema_privilege('supabase_auth_admin','crux_private','USAGE')
    or not has_table_privilege('supabase_auth_admin','crux_private.approved_users','SELECT')
    then raise exception 'Auth service hook permissions missing'; end if;
  if has_function_privilege('anon','public.crux_before_user_created(jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.crux_before_user_created(jsonb)','EXECUTE')
    then raise exception 'Signup hook exposed to app users'; end if;
end $$;
do $$
declare result jsonb;
begin
  select public.crux_before_user_created('{"user":{"email":"crux-test-b@example.invalid","app_metadata":{"provider":"google"}}}') into result;
  if result <> '{}'::jsonb then raise exception 'Approved Google signup denied'; end if;
  select public.crux_before_user_created('{"user":{"email":"crux-test-c@example.invalid","app_metadata":{"provider":"google"}}}') into result;
  if result->'error'->>'http_code' is distinct from '403' then raise exception 'Unapproved Google signup accepted'; end if;
  select public.crux_before_user_created('{"user":{"email":"crux-test-b@example.invalid","app_metadata":{"provider":"email"}}}') into result;
  if result->'error'->>'http_code' is distinct from '403' then raise exception 'Non-Google signup accepted'; end if;
end $$;
reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.user_planners;
    raise exception 'Anonymous read accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.load_planner('7091bb15-8572-484e-b99c-c2a15cb09101');
    raise exception 'Anonymous load accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_planner('7091bb15-8572-484e-b99c-c2a15cb09101',0,'{"version":2,"profiles":[{}]}');
    raise exception 'Anonymous save accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: approved Google access, private list, signup hook, revisions, account isolation, revocation and anonymous denial. All test records rolled back.' as verification;
