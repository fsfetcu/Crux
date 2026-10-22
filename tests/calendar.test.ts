import { describe, expect, it, vi } from "vitest";
import { profileCalendar, subscriptionURL, newCalendarToken } from "../src/calendar";
import { firstProfile } from "../src/profiles";
import { initialState } from "../src/model";
import { handleCalendarFeed, renderCalendar } from "../supabase/functions/_shared/calendar";
import type { CalendarDocument } from "../supabase/functions/_shared/calendar";
const sample = (): CalendarDocument => ({ profileId: "profile-a", name: "Climbing", revision: 4,
  updatedAt: "2026-10-22T09:30:00Z", events: [{ id: "one", date: "2026-10-25", name: "Kilter", location: "Gym", exercises: [] }] });
const unfold = (ics: string) => ics.replace(/\r\n /g, "");
describe("Apple Calendar files", () => {
  it("uses CRLF, all-day dates and an exclusive end across DST and year boundaries", () => {
    const document = sample(); document.events.push({ ...document.events[0], id: "two", date: "2026-12-31" });
    const ics = renderCalendar(document);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261025\r\nDTEND;VALUE=DATE:20261026");
    expect(ics).toContain("DTEND;VALUE=DATE:20270101");
    expect(ics).not.toContain("VALARM");
  });
  it("escapes untrusted values, prevents extra properties and folds UTF-8 at 75 bytes", () => {
    const document = sample(); document.events[0].name = "É🧗".repeat(60) + ",;\\\r\nBEGIN:VEVENT";
    const ics = renderCalendar(document);
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    const raw = unfold(ics);
    expect(raw.match(/\r\nBEGIN:VEVENT/g)).toHaveLength(1);
    expect(raw).toContain("\\,\\;\\\\\\nBEGIN:VEVENT");
    expect(raw).toContain("É🧗".repeat(60));
    expect(raw).not.toContain("�");
  });
  it("keeps UIDs when a plan moves, separates profiles and rejects invalid dates", () => {
    const document = sample(); const getUID = () => renderCalendar(document).match(/UID:(.*)\r\n/)![1];
    const uid = getUID(); document.events[0].date = "2026-11-01";
    expect(getUID()).toBe(uid); document.profileId = "profile-b"; expect(getUID()).not.toBe(uid);
    document.events[0].date = "2026-02-30"; expect(() => renderCalendar(document)).toThrow(/Invalid calendar date/);
  });
  it("exports multiple sessions, selected exercises and daily overrides without history or recovery", () => {
    const profile = firstProfile(initialState()).profiles[0];
    const exercise = { ...profile.state.templates.find((t) => t.id === "strength")!.exercises[0], sets: "7", reps: "4", rest: "120 sec", weightKg: 27.5 };
    profile.state.plans = [
      { id: "a", date: "2026-10-22", templateId: "kilter" },
      { id: "b", date: "2026-10-22", templateId: "strength", exercises: [exercise] },
      { id: "c", date: "2026-11-01", templateId: "chill" },
      { id: "d", date: "2026-10-22", templateId: "deleted-template" },
    ];
    const document = profileCalendar(profile, "2026-10-19", "2026-10-26");
    expect(document.events).toHaveLength(2);
    expect(document.events[1]).toMatchObject({ name: exercise.name, exercises: [{ sets: "7", rest: "120 sec" }] });
    const ics = unfold(renderCalendar(document)); expect(ics).toContain("7 sets");
    expect(ics).toContain("27.5 kg");
    expect(ics).not.toMatch(/RPE|fingers|checkins|projects|Beastmaker/);
    expect(profile.state.templates.find((t) => t.id === "strength")!.exercises[0].sets).not.toBe("7");
  });
  it("creates unique 256-bit tokens and an HTTPS subscription URL", () => {
    const a = newCalendarToken(), b = newCalendarToken();
    expect(a).toMatch(/^[a-f0-9]{64}$/); expect(a).not.toBe(b);
    expect(subscriptionURL("https://example.supabase.co/", a)).toBe(`https://example.supabase.co/functions/v1/calendar-feed/crux.ics?token=${a}`);
    expect(() => subscriptionURL("http://example.test", a)).toThrow();
  });
});
describe("private calendar HTTP endpoint", () => {
  const token = "a".repeat(64);
  const request = (suffix = `?token=${token}`, method = "GET") => new Request(`https://calendar.test/crux.ics${suffix}`, { method });
  const config = { url: "https://backend.test", anonKey: "test-anon" };
  it("returns a calendar without caching or echoing the secret, using only the projection RPC", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(sample()));
    const response = await handleCalendarFeed(request(), config, fetcher);
    expect(response.status).toBe(200); expect(response.headers.get("Content-Type")).toContain("text/calendar");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    const body = await response.text(); expect(body).toContain("SUMMARY:Kilter"); expect(body).not.toContain(token);
    expect(fetcher.mock.calls[0][0]).toBe("https://backend.test/rest/v1/rpc/read_calendar_feed");
  });
  it("rejects missing/malformed tokens and non-read requests without querying the database", async () => {
    const fetcher = vi.fn();
    expect((await handleCalendarFeed(request(""), config, fetcher)).status).toBe(404);
    expect((await handleCalendarFeed(request("?token=bad"), config, fetcher)).status).toBe(404);
    expect((await handleCalendarFeed(request("", "POST"), config, fetcher)).status).toBe(405);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses 404 for revoked links, 503 for failures, and supports HEAD without a body", async () => {
    expect((await handleCalendarFeed(request(), config, vi.fn().mockResolvedValue(Response.json(null)))).status).toBe(404);
    expect((await handleCalendarFeed(request(), config, vi.fn().mockRejectedValue(Error("secret must not leak")))).status).toBe(503);
    const head = await handleCalendarFeed(request(undefined, "HEAD"), config, vi.fn().mockResolvedValue(Response.json(sample())));
    expect(head.status).toBe(200); expect(await head.text()).toBe("");
  });
});
