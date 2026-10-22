import { describe, expect, it } from "vitest";
import { recommend, planWarnings } from "../src/engine";
import {
  addDays,
  dayKey,
  ensureWeek,
  initialState,
  weekCounts,
  weekStart,
  weekReport,
} from "../src/model";
import type { CheckIn, Workout, State, Category } from "../src/model";
import { moveSession, swapDays, carryPlans } from "../src/planning";
import { parseBackup } from "../src/storage";
const now = new Date("2026-10-21T12:00:00");
const fresh: CheckIn = {
  recovery: "recovered",
  fingers: "fresh",
  skin: "good",
  energy: "high",
};
const workout = (
  hours: number,
  category: Category = "hard",
  rpe = 8,
): Workout => ({
  id: `${category}-${hours}`,
  timestamp: new Date(now.getTime() - hours * 3600000).toISOString(),
  templateId: category === "hard" ? "kilter" : category,
  name: category,
  category,
  location: "Gym",
  duration: 60,
  rpe,
  fingers: "fresh",
  notes: "",
  fingerLoad: category === "hard",
  projects: [],
  exercises: [],
});
const stateWith = (logs: Workout[]): State => ({ ...initialState(now), logs });
describe("recovery-based recommendations", () => {
  it("prioritizes one remaining hard session after 72h when fully recovered", () => {
    const s = stateWith([workout(72)]);
    s.logs[0].timestamp = new Date("2026-10-18T12:00:00").toISOString();
    const start = weekStart(dayKey(now));
    s.logs.push({
      ...workout(72),
      id: "this-week",
      timestamp: new Date("2026-10-19T12:00:00").toISOString(),
    });
    const later = new Date("2026-10-22T12:00:00");
    expect(weekCounts(s.logs, start).hard).toBe(1);
    expect(recommend(s, fresh, later).primary.category).toBe("hard");
  });
  it("avoids a hard session the day after significant finger loading", () => {
    expect(
      recommend(stateWith([workout(24)]), fresh, now).primary.category,
    ).not.toBe("hard");
  });
  it("prioritizes rest for finger pain regardless of quotas or elapsed time", () => {
    const r = recommend(
      stateWith([workout(100)]),
      { ...fresh, fingers: "pain" },
      now,
    );
    expect(r.primary.category).toBe("rest");
    expect(r.alternative).toBeNull();
  });
  it("does not propose a third hard session when the quota is complete", () => {
    const n = new Date("2026-10-25T18:00:00");
    const s = stateWith([
      {
        ...workout(100),
        timestamp: new Date("2026-10-19T12:00:00").toISOString(),
      },
      {
        ...workout(72),
        timestamp: new Date("2026-10-22T12:00:00").toISOString(),
      },
    ]);
    expect(weekCounts(s.logs, weekStart(dayKey(n))).hard).toBe(2);
    expect(recommend(s, fresh, n).primary.category).not.toBe("hard");
  });
  it("counts SprayWall as exactly one hard session", () => {
    const l = { ...workout(24), templateId: "spray", name: "SprayWall" };
    expect(weekCounts([l], weekStart(dayKey(now)))).toEqual({
      hard: 1,
      volume: 0,
      chill: 0,
      strength: 0,
    });
  });
  it("accounts for hard strength with Beastmaker hangs", () => {
    const l = { ...workout(12, "strength"), fingerLoad: true };
    const r = recommend(stateWith([l]), fresh, now);
    expect(r.primary.category).toBe("rest");
    expect(r.hoursSinceLoad).toBe(12);
    expect(r.alternative?.omitHangs).toBe(true);
  });
  it("uses previous-week loading after week rollover", () => {
    const monday = new Date("2026-10-26T09:00:00");
    const l = {
      ...workout(18),
      timestamp: new Date("2026-10-25T15:00:00").toISOString(),
    };
    const s = ensureWeek(stateWith([l]), dayKey(monday));
    expect(weekCounts(s.logs, weekStart(dayKey(monday))).hard).toBe(0);
    expect(recommend(s, fresh, monday).primary.category).toBe("rest");
    expect(recommend(s, fresh, monday).hoursSinceLoad).toBe(18);
  });
  it("favors rest for high general fatigue", () => {
    expect(
      recommend(stateWith([]), { ...fresh, recovery: "very" }, now).primary
        .category,
    ).toBe("rest");
  });
  it("keeps some-fatigue recommendations easy even when hard sessions remain", () => {
    const r = recommend(stateWith([]), { ...fresh, recovery: "somewhat" }, now);
    expect(r.primary.category).toBe("chill");
    expect(r.alternative?.category).toBe("rest");
  });
  it("requires a daily check-in before suggesting training", () => {
    expect(recommend(stateWith([]), undefined, now).needsCheckin).toBe(true);
    expect(recommend(stateWith([]), undefined, now).primary.category).toBe(
      "rest",
    );
  });
  it("extends recovery to 72h after RPE 9", () => {
    const r = recommend(stateWith([workout(60, "hard", 9)]), fresh, now);
    expect(r.requiredHours).toBe(72);
    expect(r.primary.category).not.toBe("hard");
  });
  it("counts unusually hard volume as significant finger loading", () => {
    expect(
      recommend(stateWith([workout(12, "volume", 9)]), fresh, now).primary
        .category,
    ).toBe("rest");
  });
  it("retains recent discomfort as a reason to avoid loading", () => {
    const l = { ...workout(48, "chill", 3), fingers: "pain" as const };
    expect(recommend(stateWith([l]), fresh, now).primary.category).toBe("rest");
  });
  it("treats strength without hangs as non-finger-loading", () => {
    const l = { ...workout(12, "strength"), fingerLoad: false };
    expect(recommend(stateWith([l]), fresh, now).primary.category).toBe("hard");
  });
  it("uses a configured minimum longer than 72 hours", () => {
    const s = stateWith([workout(80)]);
    s.settings.recoveryHours = 96;
    expect(recommend(s, fresh, now).primary.category).not.toBe("hard");
    expect(recommend(s, fresh, now).requiredHours).toBe(96);
  });
  it("offers no quota-driven extra hard workouts at the end of a completed week", () => {
    const s = initialState(now);
    s.settings.goals = { hard: 0, volume: 0, chill: 0, strength: 0 };
    s.weeks = {};
    expect(recommend(s, fresh, now).primary.category).toBe("rest");
  });
  it("does not count planned sessions as completed", () => {
    const s = initialState(now);
    s.plans = [{ id: "p", date: dayKey(now), templateId: "kilter" }];
    expect(weekCounts(s.logs, weekStart(dayKey(now))).hard).toBe(0);
  });
  it("ignores impossible future workouts when calculating recovery", () => {
    const s = stateWith([workout(-24)]);
    expect(recommend(s, fresh, now).lastLoad).toBeNull();
  });
});
describe("flexible planning and archives", () => {
  it("moving and swapping plans leaves logged training and progress intact", () => {
    const s = stateWith([workout(24)]);
    s.plans = [
      { id: "a", date: "2026-10-21", templateId: "kilter" },
      { id: "b", date: "2026-10-23", templateId: "chill" },
    ];
    const before = JSON.stringify(s.logs),
      c = weekCounts(s.logs, "2026-10-19");
    const moved = moveSession(s, "a", "2026-10-22");
    const swapped = swapDays(moved, "2026-10-22", "2026-10-23");
    expect(swapped.plans[0].date).toBe("2026-10-23");
    expect(swapped.plans[1].date).toBe("2026-10-22");
    expect(JSON.stringify(swapped.logs)).toBe(before);
    expect(weekCounts(swapped.logs, "2026-10-19")).toEqual(c);
  });
  it("carries only unfinished previous-week plans forward", () => {
    const s = stateWith([workout(100)]);
    s.plans = [
      { id: "old", date: "2026-10-14", templateId: "spray" },
      { id: "new", date: "2026-10-21", templateId: "chill" },
    ];
    expect(carryPlans(s, "2026-10-19").plans.map((p) => p.date)).toEqual([
      "2026-10-21",
      "2026-10-21",
    ]);
    expect(carryPlans(s, "2026-10-19").logs).toEqual(s.logs);
  });
  it("snapshots new-week goals without deleting old weeks or history", () => {
    const s = stateWith([workout(72)]);
    const old = weekStart(dayKey(now));
    const n = ensureWeek(s, "2026-10-26");
    n.settings.goals.hard = 3;
    expect(n.weeks[old].goals.hard).toBe(2);
    expect(n.weeks["2026-10-26"].goals.hard).toBe(2);
    expect(n.logs).toHaveLength(1);
  });
  it("supports week starts and local calendar date arithmetic", () => {
    expect(weekStart("2026-10-21", 0)).toBe("2026-10-18");
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(weekStart("2027-01-01", 1)).toBe("2026-12-28");
  });
  it("warns about double finger loading and a third hard plan", () => {
    const s = initialState(now);
    s.plans = [
      { id: "a", date: "2026-10-21", templateId: "kilter" },
      { id: "b", date: "2026-10-23", templateId: "tension" },
    ];
    expect(planWarnings(s, "2026-10-21", "strength").join(" ")).toContain(
      "within 48 hours",
    );
    expect(planWarnings(s, "2026-10-24", "spray").join(" ")).toContain(
      "already covered",
    );
  });
  it("generates a useful Markdown weekly report", () => {
    const s = stateWith([
      {
        ...workout(24),
        projects: [
          { name: "The blue one", grade: "7C", attempts: 5, outcome: "sent" },
        ],
      },
    ]);
    const report = weekReport(s, "2026-10-19");
    expect(report).toContain("Hard: 1/2");
    expect(report).toContain("The blue one 7C · sent");
    expect(report).toContain("Average RPE: 8.0/10");
  });
});
describe("backup validation", () => {
  it("round trips all app data", () => {
    const s = stateWith([workout(24)]);
    expect(parseBackup(JSON.stringify(s))).toEqual(s);
  });
  it.each(["{}", '{"version":2}', "null", "not json"])(
    "rejects corrupt or unsupported backups: %s",
    (raw) => {
      expect(() => parseBackup(raw)).toThrow();
    },
  );
  it("rejects invalid recovery settings and unknown plan templates", () => {
    const s = initialState(now);
    s.settings.recoveryHours = -1;
    expect(() => parseBackup(JSON.stringify(s))).toThrow();
    const t = initialState(now);
    t.plans = [{ id: "a", date: "2026-10-21", templateId: "missing" }];
    expect(() => parseBackup(JSON.stringify(t))).toThrow();
  });
  it("rejects duplicate workouts and malformed check-ins", () => {
    const l = workout(24);
    expect(() => parseBackup(JSON.stringify(stateWith([l, l])))).toThrow();
    const s = initialState(now);
    (s.checkins as any)["2026-10-21"] = { fingers: "unknown" };
    expect(() => parseBackup(JSON.stringify(s))).toThrow();
  });
});
