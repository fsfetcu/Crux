import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { firstProfile } from "../src/profiles";
import { initialState } from "../src/model";

const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
const data = JSON.stringify(firstProfile(initialState()));
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema auth;
    create role anon; create role authenticated;
    create table auth.users(id uuid primary key);
    insert into auth.users values ('${A}'), ('${B}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;`);
  await db.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/202610220001_accounts.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec("reset role; truncate public.user_planners;");
});
const asUser = async (id: string) =>
  db.exec(
    `reset role; set request.jwt.claim.sub = '${id}'; set role authenticated;`,
  );
const save = (id = A, revision = 0) =>
  db.query("select * from public.save_planner($1::uuid,$2::bigint,$3::jsonb)", [
    id,
    revision,
    data,
  ]);

describe("Postgres account isolation and conflict rules", () => {
  it("allows creating and reading your own planner", async () => {
    await asUser(A);
    const result = await save();
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ user_id: A, revision: 1 });
    expect(
      (await db.query("select * from public.user_planners")).rows,
    ).toHaveLength(1);
  });
  it("never returns another user's records, even with an explicit user filter", async () => {
    await asUser(A);
    await save();
    await asUser(B);
    expect((await db.query("select * from public.user_planners")).rows).toEqual(
      [],
    );
    expect(
      (
        await db.query(
          "select * from public.user_planners where user_id=$1::uuid",
          [A],
        )
      ).rows,
    ).toEqual([]);
    await save(B);
    expect(
      (await db.query("select user_id from public.user_planners")).rows,
    ).toEqual([{ user_id: B }]);
  });
  it("rejects writing through an account that changed while a request was queued", async () => {
    await asUser(B);
    await expect(save(A)).rejects.toThrow("Account does not match");
    await expect(
      db.query(
        "insert into public.user_planners(user_id,data) values ($1::uuid,$2::jsonb)",
        [A, data],
      ),
    ).rejects.toThrow(/row-level security/);
  });
  it("blocks updating or taking ownership of another account's planner", async () => {
    await asUser(A);
    await save();
    await expect(
      db.query("update public.user_planners set user_id=$1::uuid", [B]),
    ).rejects.toThrow(/row-level security/);
    await asUser(B);
    expect(
      (
        await db.query(
          "update public.user_planners set data=$1::jsonb returning *",
          [data],
        )
      ).rows,
    ).toEqual([]);
  });
  it("prevents anonymous reads and writes", async () => {
    await asUser(A);
    await save();
    await db.exec("reset role; set role anon;");
    await expect(
      db.query("select * from public.user_planners"),
    ).rejects.toThrow(/permission denied/);
    await expect(save()).rejects.toThrow(/permission denied/);
  });
  it("rejects stale saves and duplicate initialization while retaining the latest copy", async () => {
    await asUser(A);
    await save();
    await expect(save()).rejects.toThrow(/newer planner/);
    expect((await save(A, 1)).rows[0]).toMatchObject({ revision: 2 });
    await expect(save(A, 1)).rejects.toThrow(/newer planner/);
    expect(
      (await db.query("select revision from public.user_planners")).rows[0],
    ).toEqual({ revision: 2 });
  });
  it("rejects malformed documents instead of replacing valid data", async () => {
    await asUser(A);
    await save();
    await expect(
      db.query("select * from public.save_planner($1::uuid,1,'{}'::jsonb)", [
        A,
      ]),
    ).rejects.toThrow(/valid_planner/);
    expect(
      (await db.query("select data from public.user_planners")).rows[0],
    ).toEqual({ data: JSON.parse(data) });
  });
});
