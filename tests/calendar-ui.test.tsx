// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { firstProfile } from "../src/profiles";
import { initialState } from "../src/model";
import { CalendarConnect } from "../src/CalendarConnect";
const profile = firstProfile(initialState()).profiles[0];
let connected = false;
const rpc = vi.fn((name: string) => name === "calendar_subscription_status" ? {
  abortSignal: () => ({ maybeSingle: async () => ({ data: { enabled: connected }, error: null }) }),
} : Promise.resolve({ error: null }));
let signedIn = true;
const client = { rpc };
vi.mock("../src/accounts/AccountContext", () => ({ useAccount: () => ({ user: signedIn ? { id: "account-a" } : null, client }) }));
vi.mock("../src/ProfileContext", () => ({ useProfiles: () => ({ active: profile, syncStatus: "saved" }) }));
beforeEach(() => {
  connected = false; signedIn = true; rpc.mockClear(); localStorage.clear();
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("calendar connection controls", () => {
  it("requires an explicit click to create a link, presents a webcal handoff, and can disable it", async () => {
    const user = userEvent.setup(); render(<CalendarConnect start="2026-10-19" onClose={() => {}} />);
    const create = await screen.findByRole("button", { name: "Create private calendar link" });
    expect(rpc).toHaveBeenCalledTimes(1);
    await user.click(create);
    const link = await screen.findByRole("link", { name: "Add to Apple Calendar" });
    expect(link.getAttribute("href")).toMatch(/^webcal:\/\/example\.supabase\.co\/functions\/v1\/calendar-feed\/crux\.ics\?token=[a-f0-9]{64}$/);
    expect(rpc).toHaveBeenCalledWith("enable_calendar_subscription", { p_profile_id: profile.id, p_token: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(localStorage.length).toBe(0);
    await user.click(screen.getByRole("button", { name: "Disable calendar link" }));
    await waitFor(() => expect(screen.queryByRole("link", { name: "Add to Apple Calendar" })).toBeNull());
    expect(rpc).toHaveBeenCalledWith("disable_calendar_subscription", { p_profile_id: profile.id });
  });
  it("does not recover or persist an existing secret and explicitly labels rotation", async () => {
    connected = true; render(<CalendarConnect start="2026-10-19" onClose={() => {}} />);
    expect(await screen.findByText("Private link enabled")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Add to Apple Calendar" })).toBeNull();
    expect(screen.getByRole("button", { name: "Replace link (old link stops working)" })).toBeTruthy();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("keeps device-only export available with clear snapshot semantics", async () => {
    signedIn = false; profile.state.plans = [
      { id: "a", date: "2026-10-22", templateId: "kilter" },
      { id: "b", date: "2026-11-22", templateId: "spray" },
    ];
    const user = userEvent.setup(); render(<CalendarConnect start="2026-10-19" onClose={() => {}} />);
    expect(screen.getByText("1 planned workout")).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Include"), "all");
    expect(screen.getByText("2 planned workouts")).toBeTruthy();
    expect(screen.getByText(/A one-time copy/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Download .ics" }) as HTMLButtonElement).disabled).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});
