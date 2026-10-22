import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initialState } from "../src/model";
import { firstProfile } from "../src/profiles";
const A = "00000000-0000-4000-8000-000000000001", B = "00000000-0000-4000-8000-000000000002";
const token = "a".repeat(64), replacement = "b".repeat(64);
let db: PGlite;
const profile = firstProfile(initialState()).profiles[0];
profile.state.plans = [{ id: "one", date: "2026-10-22", templateId: "strength", exercises: [
  { id: "custom", name: "Daily exercise", sets: "9", reps: "4", rest: "200 sec", fingerLoad: false },
] }, { id: "two", date: "2026-10-22", templateId: "kilter" }];
profile.state.weeks.private = { start: "2026-10-19", startDay: 1, goals: {}, notes: "PRIVATE HEALTH NOTES" };
const document = JSON.stringify({ version: 2, activeProfileId: profile.id, profiles: [profile, { ...profile, id: "other", name: "OTHER PRIVATE PROFILE" }] });
const asUser = (id = A) => db.exec(`reset role; set request.jwt.claim.sub='${id}'; set role authenticated;`);
const anonymous = () => db.exec("reset role; set request.jwt.claim.sub=''; set role anon;");
const enable = (secret = token, id = profile.id) => db.query("select public.enable_calendar_subscription($1,$2)", [id, secret]);
const feed = async (secret = token) => (await db.query<{ result: Record<string, unknown> | null }>("select public.read_calendar_feed($1) as result", [secret])).rows[0].result;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema auth; create role anon; create role authenticated; create role supabase_auth_admin;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
    create table auth.identities(user_id uuid, provider text, identity_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;`);
  for (const file of ["202610220001_accounts.sql", "202610220002_google_friends.sql", "202610220003_calendar_subscriptions.sql"])
    await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`reset role; truncate crux_private.calendar_subscriptions,public.user_planners,auth.users,auth.identities,crux_private.approved_users;
    insert into auth.users values ('${A}','a@example.test',now()),('${B}','b@example.test',now());
    insert into auth.identities values ('${A}','google','{"email":"a@example.test","email_verified":true}'),('${B}','google','{"email":"b@example.test","email_verified":true}');
    insert into crux_private.approved_users(email) values ('a@example.test'),('b@example.test');`);
  await asUser(); await db.query("select public.save_planner($1,0,$2)", [A, document]);
});
describe("private profile subscriptions", () => {
  it("requires explicit opt-in, exposes only planned workout fields and stores only a token hash", async () => {
    await anonymous(); expect(await feed()).toBeNull();
    await asUser(); await enable(); await anonymous();
    const result = await feed();
    expect(result).toMatchObject({ profileId: profile.id, events: [
      { id: "one", name: "Daily exercise", exercises: [{ name: "Daily exercise", sets: "9", reps: "4", rest: "200 sec" }] },
      { id: "two", name: "Kilter" },
    ] });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|finger|checkin|notes|rpe|@example|approved|token/);
    await expect(db.query("select * from crux_private.calendar_subscriptions")).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
    const row = (await db.query<{ token_hash: string }>("select * from crux_private.calendar_subscriptions")).rows[0];
    expect(row.token_hash).not.toBe(token); expect(JSON.stringify(row)).not.toContain(token);
  });
  it("denies anonymous link management and cross-account management", async () => {
    await enable(); await anonymous();
    await expect(enable()).rejects.toThrow(/permission denied/);
    await expect(db.query("select * from public.calendar_subscription_status($1)", [profile.id])).rejects.toThrow(/permission denied/);
    await asUser(B);
    expect((await db.query("select * from public.calendar_subscription_status($1)", [profile.id])).rows).toEqual([]);
    await expect(enable(replacement)).rejects.toThrow(/Save this profile/);
    await db.query("select public.disable_calendar_subscription($1)", [profile.id]);
    await anonymous(); expect(await feed()).not.toBeNull();
    expect(await feed("c".repeat(64))).toBeNull(); expect(await feed("bad")).toBeNull();
  });
  it("reflects moves and removals from the latest saved revision while preserving plan identities", async () => {
    await enable();
    const changed = JSON.parse(document); changed.profiles[0].state.plans = [{ ...profile.state.plans[0], date: "2026-10-24" }];
    await db.query("select public.save_planner($1,1,$2)", [A, JSON.stringify(changed)]);
    await anonymous(); const result = await feed();
    expect(result).toMatchObject({ revision: 2, events: [{ id: "one", date: "2026-10-24" }] });
    expect((result!.events as unknown[])).toHaveLength(1);
  });
  it("rotates/disables links, and immediately denies revoked or unverified accounts", async () => {
    await enable(); await enable(replacement); await anonymous();
    expect(await feed()).toBeNull(); expect(await feed(replacement)).not.toBeNull();
    await asUser(); await db.query("select public.disable_calendar_subscription($1)", [profile.id]);
    await anonymous(); expect(await feed(replacement)).toBeNull();
    await asUser(); await enable();
    await db.exec("reset role; update crux_private.approved_users set allowed=false where email='a@example.test';");
    await anonymous(); expect(await feed()).toBeNull();
    await db.exec("reset role; update crux_private.approved_users set allowed=true; update auth.identities set identity_data='{}' where user_id='" + A + "';");
    await anonymous(); expect(await feed()).toBeNull();
  });
});
