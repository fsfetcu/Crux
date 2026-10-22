-- Run as postgres after the calendar migration. Fictional data is rolled back.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
  ('7091bb15-8572-484e-b99c-c2a15cb09301','crux-calendar-test@example.invalid',now(),'{}');
insert into auth.identities(id,user_id,provider,provider_id,identity_data) values
  ('7091bb15-8572-484e-b99c-c2a15cb09302','7091bb15-8572-484e-b99c-c2a15cb09301',
    'google','crux-calendar-transaction-only','{"sub":"crux-calendar-transaction-only","email":"crux-calendar-test@example.invalid","email_verified":true}');
insert into crux_private.approved_users(email) values ('crux-calendar-test@example.invalid');
set local role authenticated;
set local request.jwt.claim.sub = '7091bb15-8572-484e-b99c-c2a15cb09301';
select count(*) as test_document_saved from public.save_planner(
  '7091bb15-8572-484e-b99c-c2a15cb09301',0,
  '{"version":2,"profiles":[{"id":"calendar-test","name":"Transaction only","state":{"plans":[{"id":"p1","date":"2026-10-22","templateId":"strength","exercises":[{"name":"Bench press","sets":"4","reps":"8","rest":"120 sec","weightKg":57.5}]}],"templates":[{"id":"strength","name":"Strength","location":"Gym","exercises":[]}],"checkins":{"private":"NEVER EXPOSE"},"logs":[{"notes":"NEVER EXPOSE"}]}},{"id":"other","name":"OTHER PRIVATE PROFILE"}]}'::jsonb
);
select public.enable_calendar_subscription('calendar-test',repeat('e',64));
set local role anon;
set local request.jwt.claim.sub = '';
do $$
declare feed jsonb;
begin
  feed := public.read_calendar_feed(repeat('e',64));
  if feed->>'profileId' is distinct from 'calendar-test'
    or feed->'events'->0->>'name' is distinct from 'Bench press'
    or feed->'events'->0->'exercises'->0->>'rest' is distinct from '120 sec'
    or feed->'events'->0->'exercises'->0->>'weightKg' is distinct from '57.5'
    or jsonb_array_length(feed->'events') <> 1
    or feed::text like '%PRIVATE%' or feed::text like '%NEVER EXPOSE%'
  then raise exception 'Private calendar projection failed'; end if;
  if public.read_calendar_feed(repeat('f',64)) is not null then
    raise exception 'Unknown token accepted'; end if;
  begin
    perform 1 from crux_private.calendar_subscriptions;
    raise exception 'Anonymous caller could read subscription table';
  exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;
set local request.jwt.claim.sub = '7091bb15-8572-484e-b99c-c2a15cb09301';
select public.enable_calendar_subscription('calendar-test',repeat('f',64));
set local role anon;
do $$ begin
  if public.read_calendar_feed(repeat('e',64)) is not null
    or public.read_calendar_feed(repeat('f',64)) is null
  then raise exception 'Link replacement failed'; end if;
end $$;
set local role authenticated;
select public.disable_calendar_subscription('calendar-test');
set local role anon;
do $$ begin
  if public.read_calendar_feed(repeat('f',64)) is not null then
    raise exception 'Disabled link accepted'; end if;
end $$;
reset role;
do $$ begin
  if exists (select 1 from crux_private.calendar_subscriptions
    where user_id='7091bb15-8572-484e-b99c-c2a15cb09301' and token_hash=repeat('f',64))
  then raise exception 'Raw subscription token stored'; end if;
end $$;
rollback;
select 'PASS: calendar projection, private fields, token hashing, anonymous denial, replacement and disabling. All fictional records rolled back.' as verification;
