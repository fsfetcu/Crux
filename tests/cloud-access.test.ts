import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { plannerCloud, PlannerAccessDenied } from "../src/accounts/cloud";

describe("restricted cloud requests", () => {
  it("uses the access-checked read endpoint and rejects refusal instead of initializing an empty planner", async () => {
    const maybeSingle = vi.fn(async () => ({ data: null, error: { code: "PT403" } }));
    const rpc = vi.fn(() => ({ abortSignal: () => ({ maybeSingle }) }));
    const cloud = plannerCloud({ rpc } as unknown as SupabaseClient, true);
    await expect(cloud.read("A", new AbortController().signal)).rejects.toBeInstanceOf(PlannerAccessDenied);
    expect(rpc).toHaveBeenCalledWith("load_planner", { p_user_id: "A" });
  });
  it("distinguishes an approved new account from a refusal and keeps network failures retryable", async () => {
    const maybeSingle = vi.fn().mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "FETCH_ERROR", message: "Offline" } });
    const cloud = plannerCloud({ rpc: () => ({ abortSignal: () => ({ maybeSingle }) }) } as unknown as SupabaseClient, true);
    const signal = new AbortController().signal;
    expect(await cloud.read("A", signal)).toBeNull();
    await expect(cloud.read("A", signal)).rejects.toMatchObject({ code: "FETCH_ERROR" });
  });
});
