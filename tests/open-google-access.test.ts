import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
const A="00000000-0000-4000-8000-000000000011",B="00000000-0000-4000-8000-000000000012",C="00000000-0000-4000-8000-000000000013";
const data=JSON.stringify({version:2,profiles:[{id:"personal",name:"My plan",state:{plans:[{id:"one",date:"2026-10-23",templateId:"strength"}],templates:[{id:"strength",name:"Strength",location:"Gym",exercises:[]}],logs:[{notes:"PRIVATE TRAINING NOTES"}]}}],catalogue:[{id:"mine"}],catalogueRevision:1});
const migration=readFileSync(new URL("../supabase/migrations/202610230001_open_google_signup.sql",import.meta.url),"utf8");
let db:PGlite;
const asUser=(id=A)=>db.exec(`reset role; set request.jwt.claim.sub='${id}'; set role authenticated;`);
const save=(id=A,revision=0)=>db.query("select * from public.save_planner($1::uuid,$2::bigint,$3::jsonb)",[id,revision,data]);
const load=(id=A)=>db.query("select * from public.load_planner($1::uuid)",[id]);
const anonymous=()=>db.exec("reset role; set request.jwt.claim.sub=''; set role anon;");
const feed=async(token="a".repeat(64))=>(await db.query<{result:unknown}>("select public.read_calendar_feed($1) as result",[token])).rows[0].result;
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`create schema auth; create role anon; create role authenticated; create role supabase_auth_admin;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz,raw_user_meta_data jsonb);
    create table auth.identities(id uuid,user_id uuid,provider text,provider_id text,identity_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;`);
  for(const file of ["202610220001_accounts.sql","202610220002_google_friends.sql","202610220003_calendar_subscriptions.sql","202610220004_calendar_weights.sql","202610220005_preserve_catalogue.sql","202610220006_catalogue_revision.sql"])
    await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`,import.meta.url),"utf8"));
  await db.exec(migration);
},30000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{
  await db.exec(`reset role; truncate crux_private.calendar_subscriptions,public.user_planners,auth.users,auth.identities,crux_private.approved_users;
    insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
      ('${A}','new-person@gmail.com',now(),'{}'),('${B}','another-person@gmail.com',now(),'{}'),
      ('${C}','forged@gmail.com',now(),'{"approved":true,"provider":"google","email_verified":true}');
    insert into auth.identities(user_id,provider,identity_data) values
      ('${A}','google','{"email":"new-person@gmail.com","email_verified":true}'),
      ('${B}','google','{"email":"another-person@gmail.com","email_verified":true}'),
      ('${C}','email','{"email":"forged@gmail.com","email_verified":true}');`);
});
describe("self-service Google accounts",()=>{
  it("lets a new verified Google account save/load without an invitation, even if its historical entry was disabled",async()=>{
    await asUser();await save();expect((await load()).rows).toHaveLength(1);
    await db.exec("reset role; insert into crux_private.approved_users(email,allowed) values ('new-person@gmail.com',false);");
    await asUser();expect((await load()).rows).toHaveLength(1);
  });
  it("retains own-account RLS, RPC ownership and revision conflicts for all newcomers",async()=>{
    await asUser();await save();await asUser(B);await save(B);
    expect((await db.query("select * from public.user_planners")).rows).toHaveLength(1);
    await expect(load(A)).rejects.toThrow(/does not have access/);
    await expect(save(A,1)).rejects.toThrow(/does not have access/);
    expect((await db.query("update public.user_planners set revision=99 where user_id=$1 returning *",[A])).rows).toEqual([]);
    await expect(db.query("update public.user_planners set user_id=$1 where user_id=$2",[A,B])).rejects.toThrow(/row-level security|duplicate key/);
    await expect(save(B,0)).rejects.toThrow(/newer planner/);
    await save(B,1);await expect(save(B,1)).rejects.toThrow(/newer planner/);
  });
  it("requires a matching verified Google identity rather than editable metadata",async()=>{
    await asUser(C);await expect(save(C)).rejects.toThrow(/does not have access/);
    for(const patch of ["email_confirmed_at=null","email='different@gmail.com'"]){
      await db.exec(`reset role; update auth.users set ${patch} where id='${A}';`);
      await asUser();await expect(save()).rejects.toThrow(/does not have access/);
      await db.exec(`reset role; update auth.users set email_confirmed_at=now(),email='new-person@gmail.com' where id='${A}';`);
    }
    await db.exec(`update auth.identities set identity_data='{"email":"new-person@gmail.com","email_verified":false}' where user_id='${A}';`);
    await asUser();await expect(save()).rejects.toThrow(/does not have access/);
  });
  it("limits the signup hook to the auth service and denies malformed/non-Google signup",async()=>{
    await db.exec("set role supabase_auth_admin;");
    const hook=async(user:unknown)=>(await db.query<{result:any}>("select public.crux_before_user_created($1) as result",[JSON.stringify({user})])).rows[0].result;
    for(const email of ["new-person@gmail.com","someone@googlemail.com","person@workspace.example"])
      expect(await hook({email,app_metadata:{provider:"google"}})).toEqual({});
    for(const user of [{email:"new-person@gmail.com",app_metadata:{provider:"email"}}, {app_metadata:{provider:"google"}}, {email:"invalid",app_metadata:{provider:"google"}}, {email:"a@gmail.com",is_anonymous:true,app_metadata:{provider:"google"}}, {email:"a@gmail.com",user_metadata:{provider:"google"}}])
      expect(await hook(user)).toMatchObject({error:{http_code:403}});
    await asUser();await expect(db.query("select public.crux_before_user_created('{}')")).rejects.toThrow(/permission denied/);
    await expect(db.query("select crux_private.google_account_verified($1)",[B])).rejects.toThrow(/permission denied/);
    await expect(db.query("select * from crux_private.approved_users")).rejects.toThrow(/permission denied/);
    await anonymous();await expect(load()).rejects.toThrow(/permission denied/);await expect(save()).rejects.toThrow(/permission denied/);
  });
  it("lets a new account opt into a private calendar without exposing its other training data",async()=>{
    await asUser();await save();await db.query("select public.enable_calendar_subscription('personal',$1)",["a".repeat(64)]);
    await anonymous();const result=await feed();expect(result).toMatchObject({profileId:"personal",events:[{name:"Strength",date:"2026-10-23"}]});
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|gmail|catalogue|logs/);
    expect(await feed("b".repeat(64))).toBeNull();
    await asUser(B);expect((await db.query("select * from public.calendar_subscription_status('personal')")).rows).toEqual([]);
    await expect(db.query("select public.enable_calendar_subscription('personal',$1)",["b".repeat(64)])).rejects.toThrow(/Save this profile/);
  });
  it("blocks banned accounts and their calendar feeds immediately, without deleting training",async()=>{
    await asUser();await save();await db.query("select public.enable_calendar_subscription('personal',$1)",["a".repeat(64)]);
    await db.exec(`reset role; update auth.users set banned_until=now()+interval '1 day' where id='${A}';`);
    await asUser();await expect(load()).rejects.toThrow(/does not have access/);await expect(save(A,1)).rejects.toThrow(/does not have access/);
    expect((await db.query("select * from public.user_planners")).rows).toEqual([]);
    await anonymous();expect(await feed()).toBeNull();
    await db.exec(`reset role; update auth.users set banned_until=now()-interval '1 second' where id='${A}';`);
    await asUser();expect((await load()).rows[0]).toMatchObject({data:JSON.parse(data),revision:1});
  });
  it("can reapply the migration without changing existing planners or calendar links",async()=>{
    await asUser();await save();await db.query("select public.enable_calendar_subscription('personal',$1)",["a".repeat(64)]);
    await db.exec("reset role;");await db.exec(migration);await asUser();
    expect((await load()).rows[0]).toMatchObject({data:JSON.parse(data),revision:1});
    await anonymous();expect(await feed()).not.toBeNull();
  });
  it("runs the live verification in a transaction and retains no fictional accounts",async()=>{
    const results=await db.exec(readFileSync(new URL("../supabase/verify-open-google-accounts.sql",import.meta.url),"utf8"));
    expect(results.at(-1)?.rows[0]).toMatchObject({verification:expect.stringContaining("PASS: open Google signup")});
    expect((await db.query("select * from auth.users where email like 'crux-test-%@example.invalid'")).rows).toEqual([]);
  });
});
