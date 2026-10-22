import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
const C = "00000000-0000-4000-8000-000000000003";
const D = "00000000-0000-4000-8000-000000000004";
const document = '{"version":2,"profiles":[{"id":"test"}]}';
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema auth;
    create role anon; create role authenticated; create role supabase_auth_admin;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb);
    create table auth.identities(id uuid, user_id uuid, provider text, provider_id text, identity_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;`);
  for (const file of ["202610220001_accounts.sql", "202610220002_google_friends.sql", "202610220003_calendar_subscriptions.sql", "202610220004_calendar_weights.sql", "202610220005_preserve_catalogue.sql"])
    await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`,import.meta.url),"utf8"));
},30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`reset role; truncate crux_private.calendar_subscriptions,public.user_planners,auth.users,auth.identities,crux_private.approved_users;
    insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
      ('${A}','a@example.test',now(),'{}'),('${B}','b@example.test',now(),'{}'),
      ('${C}','c@example.test',now(),'{"approved":true,"email":"a@example.test","provider":"google"}'),
      ('${D}','d@example.test',now(),'{"email_verified":true,"provider":"google"}');
    insert into auth.identities(user_id,provider,identity_data) values
      ('${A}','google','{"email":"a@example.test","email_verified":true}'),
      ('${B}','google','{"email":"b@example.test","email_verified":true}'),
      ('${C}','google','{"email":"c@example.test","email_verified":true}'),
      ('${D}','email','{"email":"d@example.test","email_verified":true}');
    insert into crux_private.approved_users(email) values ('a@example.test'),('b@example.test'),('d@example.test');`);
});
const asUser = (id: string) => db.exec(`reset role; set request.jwt.claim.sub='${id}'; set role authenticated;`);
const save = (id=A,revision=0) => db.query("select * from public.save_planner($1::uuid,$2::bigint,$3::jsonb)",[id,revision,document]);
const load = (id=A) => db.query("select * from public.load_planner($1::uuid)",[id]);
describe("private Google account access",() => {
  it("preserves a catalogue on older client saves and accepts an explicit empty catalogue", async () => {
    await asUser(A);
    const current = {...JSON.parse(document), catalogue: [{id:"private-example", name:"My exercise"}]};
    await db.query("select * from public.save_planner($1,0,$2)", [A, JSON.stringify(current)]);
    const legacy = (await db.query<{data:{catalogue:unknown[]}}>("select * from public.save_planner($1,1,$2)", [A, document])).rows[0];
    expect(legacy.data.catalogue).toEqual(current.catalogue);
    const cleared = (await db.query<{data:{catalogue:unknown[]}}>("select * from public.save_planner($1,2,$2)", [A, JSON.stringify({...current,catalogue:[]})])).rows[0];
    expect(cleared.data.catalogue).toEqual([]);
    await expect(save(A,1)).rejects.toThrow(/newer planner/);
  });
  it("runs the calendar deployment verification and rolls back its fictional records", async () => {
    const results = await db.exec(readFileSync(new URL('../supabase/verify-calendar.sql', import.meta.url), 'utf8'));
    expect(results.at(-1)?.rows[0]).toMatchObject({verification: expect.stringContaining('PASS: calendar projection')});
    expect((await db.query("select * from auth.users where email='crux-calendar-test@example.invalid'")).rows).toEqual([]);
  });
  it("runs the complete deployment verification without retaining test records",async () => {
    const results = await db.exec(readFileSync(new URL('../supabase/verify-google-accounts.sql',import.meta.url),'utf8'));
    expect(results.at(-1)?.rows[0]).toMatchObject({verification:expect.stringContaining('PASS: approved Google access')});
    expect((await db.query("select * from auth.users where email like 'crux-test-%@example.invalid'")).rows).toEqual([]);
  });
  it("allows an approved verified Google identity and preserves cross-account isolation",async () => {
    await asUser(A); await save();
    expect((await load()).rows).toHaveLength(1);
    await asUser(B);
    expect((await load(B)).rows).toEqual([]);
    expect((await db.query('select * from public.user_planners')).rows).toEqual([]);
    await expect(load(A)).rejects.toThrow(/does not have access/);
    await expect(save(A,1)).rejects.toThrow(/does not have access/);
    await save(B);
  });
  it("denies unapproved users despite forged editable metadata",async () => {
    await asUser(C);
    await expect(load(C)).rejects.toThrow(/does not have access/);
    await expect(save(C)).rejects.toThrow(/does not have access/);
    await expect(db.query("insert into public.user_planners(user_id,data) values ($1,$2)",[C,document])).rejects.toThrow(/row-level security/);
  });
  it("requires a matching verified Google identity, not just an approved address",async () => {
    await asUser(D); await expect(save(D)).rejects.toThrow(/does not have access/);
    await db.exec(`reset role; update auth.users set email_confirmed_at=null where id='${A}';`);
    await asUser(A); await expect(save()).rejects.toThrow(/does not have access/);
    await db.exec(`reset role; update auth.users set email_confirmed_at=now() where id='${A}'; update auth.identities set identity_data='{"email":"different@example.test","email_verified":true}' where user_id='${A}';`);
    await asUser(A); await expect(save()).rejects.toThrow(/does not have access/);
    await db.exec(`reset role; update auth.identities set identity_data='{"email":"a@example.test","email_verified":false}' where user_id='${A}';`);
    await asUser(A); await expect(save()).rejects.toThrow(/does not have access/);
  });
  it("revokes access for an existing session without deleting its planner",async () => {
    await asUser(A); await save();
    await db.exec("reset role; update crux_private.approved_users set allowed=false where email='a@example.test';");
    await asUser(A);
    await expect(load()).rejects.toThrow(/does not have access/);
    await expect(save(A,1)).rejects.toThrow(/does not have access/);
    expect((await db.query('update public.user_planners set revision=99 returning *')).rows).toEqual([]);
    expect((await db.query('select * from public.user_planners')).rows).toEqual([]);
    await db.exec("reset role; update crux_private.approved_users set allowed=true where email='a@example.test';");
    await asUser(A); expect((await load()).rows[0]).toMatchObject({revision:1});
  });
  it("does not expose or let members modify the private email list",async () => {
    await asUser(A);
    await expect(db.query('select * from crux_private.approved_users')).rejects.toThrow(/permission denied/);
    await expect(db.query("insert into crux_private.approved_users(email) values ('c@example.test')")).rejects.toThrow(/permission denied/);
    await expect(db.query("update crux_private.approved_users set allowed=true")).rejects.toThrow(/permission denied/);
    await expect(db.query("select public.crux_before_user_created('{}')")).rejects.toThrow(/permission denied/);
    await db.exec('reset role; set role anon;');
    await expect(load()).rejects.toThrow(/permission denied/);
    await expect(save()).rejects.toThrow(/permission denied/);
  });
  it("lets only the auth service check signup and fails closed on missing or non-Google identities",async () => {
    await db.exec('set role supabase_auth_admin;');
    const hook = async (email?: string,provider?: string) => (await db.query<{result: Record<string,unknown>}>(
      'select public.crux_before_user_created($1::jsonb) as result',
      [JSON.stringify({user:{email,app_metadata:{provider}}})],
    )).rows[0].result;
    expect(await hook(' A@EXAMPLE.TEST ','google')).toEqual({});
    for (const [email,provider] of [['c@example.test','google'],['a@example.test','email'],[undefined,undefined]])
      expect(await hook(email,provider)).toMatchObject({error:{http_code:403}});
  });
  it("retains revision conflict protection for approved accounts",async () => {
    await asUser(A); await save();
    expect((await save(A,1)).rows[0]).toMatchObject({revision:2});
    await expect(save(A,1)).rejects.toThrow(/newer planner/);
    await expect(save(A,0)).rejects.toThrow(/newer planner/);
  });
});
