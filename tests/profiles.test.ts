// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  createProfile,
  firstProfile,
  loadProfiles,
  parseProfileBackup,
  PROFILE_KEY,
  replaceProfileState,
  saveProfiles,
} from "../src/profiles";
import {
  dayKey,
  emptyProfileState,
  initialState,
  trainingTags,
  weekCounts,
  weekReport,
  weekStart,
} from "../src/model";
import type { SessionTemplate, State, Workout } from "../src/model";
import { recommend } from "../src/engine";
import { parseBackup } from "../src/storage";
const now = new Date("2026-10-21T12:00:00");
const fresh = {
  recovery: "recovered",
  fingers: "fresh",
  skin: "good",
  energy: "high",
} as const;
const session = (
  id: string,
  intensity: SessionTemplate["intensity"],
  loading: SessionTemplate["loading"],
): SessionTemplate => ({
  id,
  name: id,
  category: "running",
  location: "Outside",
  description: "",
  exercises: [],
  intensity,
  loading,
});
const running = (): State => {
  const s = emptyProfileState(now);
  return {
    ...s,
    types: [{ id: "running", name: "Running" }],
    settings: { ...s.settings, goals: { running: 2 } },
    templates: [
      ...s.templates,
      session("Intervals", "hard", ["lower", "cardio"]),
      session("Easy run", "easy", ["lower", "cardio"]),
    ],
    weeks: {},
  };
};
const log = (template: SessionTemplate, hours = 12, rpe = 8): Workout => ({
  ...template,
  id: template.id + hours,
  templateId: template.id,
  timestamp: new Date(now.getTime() - hours * 3600000).toISOString(),
  duration: 45,
  rpe,
  fingers: "fresh",
  notes: "",
  fingerLoad: false,
  projects: [],
  exercises: [],
});
beforeEach(() => localStorage.clear());
describe("profiles and migration", () => {
  it("migrates the complete original plan without modifying its recovery copy", () => {
    const state = initialState(now);
    state.plans = [
      { id: "original-plan", date: dayKey(now), templateId: "spray" },
    ];
    state.logs = [log(state.templates[0], 72)];
    state.checkins[dayKey(now)] = fresh;
    const raw = JSON.stringify(state);
    localStorage.setItem("crux-planner-v1", raw);
    const loaded = loadProfiles();
    expect(loaded.error).toBe("");
    expect(loaded.data.profiles[0].state).toEqual(state);
    expect(loaded.data.profiles[0].name).toContain("Oct 2026–Jan 2027");
    saveProfiles(loaded.data);
    expect(localStorage.getItem("crux-planner-v1")).toBe(raw);
    expect(loadProfiles().data).toEqual(loaded.data);
  });
  it("creates a blank independent profile and preserves the original", () => {
    const original = firstProfile(initialState(now));
    const next = createProfile(original, "Running", false, now);
    expect(next.profiles).toHaveLength(2);
    expect(next.profiles[0]).toEqual(original.profiles[0]);
    expect(next.profiles[1].state.types).toEqual([]);
    expect(next.profiles[1].state.settings.goals).toEqual({});
    expect(next.profiles[1].state.logs).toEqual([]);
  });
  it("copies only the library and settings with no shared mutable objects", () => {
    const state = initialState(now);
    state.logs = [log(state.templates[0])];
    state.plans = [{ id: "a", date: dayKey(now), templateId: "kilter" }];
    state.checkins[dayKey(now)] = fresh;
    const original = firstProfile(state),
      next = createProfile(original, "Next season", true, now);
    const copy = next.profiles[1].state;
    expect(copy.templates).toEqual(state.templates);
    expect(copy.logs).toEqual([]);
    expect(copy.plans).toEqual([]);
    expect(copy.checkins).toEqual({});
    copy.templates[0].name = "Changed";
    expect(state.templates[0].name).toBe("Kilter");
  });
  it("updates only the intended profile and round trips a multi-profile backup", () => {
    const original = createProfile(
      firstProfile(initialState(now)),
      "Running",
      false,
      now,
    );
    const next = replaceProfileState(
      original,
      original.activeProfileId,
      running(),
    );
    expect(next.profiles[0]).toEqual(original.profiles[0]);
    expect(parseProfileBackup(JSON.stringify(next))).toEqual(next);
    saveProfiles(next);
    expect(loadProfiles().data.activeProfileId).toBe(next.activeProfileId);
  });
  it("never falls back to stale v1 data when a v2 document is corrupt", () => {
    localStorage.setItem("crux-planner-v1", JSON.stringify(initialState(now)));
    localStorage.setItem(PROFILE_KEY, "broken");
    expect(loadProfiles().error).not.toBe("");
    expect(localStorage.getItem(PROFILE_KEY)).toBe("broken");
  });
  it("rejects duplicate profiles, missing active profiles and invalid loading tags", () => {
    const data = firstProfile(running());
    expect(() =>
      parseProfileBackup(
        JSON.stringify({
          ...data,
          profiles: [...data.profiles, ...data.profiles],
        }),
      ),
    ).toThrow();
    expect(() =>
      parseProfileBackup(
        JSON.stringify({ ...data, activeProfileId: "missing" }),
      ),
    ).toThrow();
    const bad = structuredClone(data);
    bad.profiles[0].state.templates[1].loading = ["unknown" as never];
    expect(() => parseProfileBackup(JSON.stringify(bad))).toThrow();
  });
  it("rejects a profile with no safe recovery session or dangling workout types", () => {
    const state = running();
    state.templates = state.templates.filter((t) => t.category !== "rest");
    expect(() => parseBackup(JSON.stringify(state))).toThrow();
    const other = running();
    other.templates[1].category = "missing";
    expect(() => parseBackup(JSON.stringify(other))).toThrow();
  });
});
describe("tag-based recommendations for arbitrary workout types", () => {
  it("recommends a custom hard workout when recovered without relying on category names", () => {
    const state = running();
    const r = recommend(state, fresh, now);
    expect(r.primary.templateId).toBe("Intervals");
    expect(r.primary.reason).toContain("lower body");
    expect(r.primary.reason).toContain("2 Running sessions remain");
  });
  it("avoids repeating hard lower-body loading yesterday", () => {
    const state = running();
    state.logs = [log(state.templates[1])];
    const r = recommend(state, fresh, now);
    expect(r.primary.intensity).toBe("rest");
    expect(r.hoursSinceLoad).toBe(12);
  });
  it("uses another profile's history for recovery without adding it to weekly quotas", () => {
    const state = running(),
      other = log(state.templates[1]);
    const r = recommend(state, fresh, now, [other]);
    expect(r.primary.intensity).toBe("rest");
    expect(weekCounts(state.logs, weekStart(dayKey(now))).running ?? 0).toBe(0);
  });
  it("can choose a recovered area with different loading tags", () => {
    const state = running();
    state.types!.push({ id: "upper", name: "Upper-body strength" });
    state.settings.goals.upper = 1;
    state.templates.push({
      ...session("Pull day", "hard", ["upper"]),
      category: "upper",
    });
    state.logs = [log(state.templates[1])];
    expect(recommend(state, fresh, now).primary.templateId).toBe("Pull day");
  });
  it("uses easy tags for fatigue even when the workout type is otherwise hard", () => {
    expect(
      recommend(running(), { ...fresh, recovery: "somewhat" }, now).primary
        .templateId,
    ).toBe("Easy run");
  });
  it("does not add hard workouts after the custom type quota is complete", () => {
    const state = running();
    state.logs = [log(state.templates[1], 48), log(state.templates[2], 24, 3)];
    const r = recommend(state, fresh, now);
    expect(r.primary.intensity).toBe("rest");
    expect(r.primary.reason).toContain("pool is complete");
  });
  it("extends custom recovery after RPE 9 and retains prior-week loading", () => {
    const state = running();
    state.logs = [log(state.templates[1], 60, 9)];
    expect(recommend(state, fresh, now).primary.intensity).not.toBe("hard");
    const monday = new Date("2026-10-26T12:00:00");
    state.logs = [
      { ...log(state.templates[1]), timestamp: "2026-10-25T18:00:00Z" },
    ];
    expect(recommend(state, fresh, monday).primary.intensity).toBe("rest");
  });
  it("uses historical intensity/loading snapshots after the workout library changes", () => {
    const state = running();
    state.logs = [log(state.templates[1])];
    state.templates[1] = {
      ...state.templates[1],
      intensity: "easy",
      loading: ["upper"],
    };
    expect(trainingTags(state.logs[0])).toEqual({
      intensity: "hard",
      loading: ["lower", "cardio"],
    });
    state.templates.push(session("Leg day", "hard", ["lower"]));
    expect(recommend(state, fresh, now).primary.templateId).not.toBe("Leg day");
  });
  it("counts custom workout types and includes them in weekly Markdown reviews", () => {
    const state = running();
    state.logs = [log(state.templates[1])];
    expect(weekCounts(state.logs, "2026-10-19").running).toBe(1);
    expect(weekReport(state, "2026-10-19")).toContain("Running: 1/2");
  });
  it("keeps high fatigue and finger discomfort overrides for every profile", () => {
    expect(
      recommend(running(), { ...fresh, recovery: "very" }, now).primary
        .intensity,
    ).toBe("rest");
    expect(
      recommend(running(), { ...fresh, fingers: "pain" }, now).primary
        .intensity,
    ).toBe("rest");
  });
});

describe("finger-exercise modifications", () => {
  const hangs = {
    id: "hangs",
    name: "Hangs",
    sets: "5",
    reps: "10s",
    rest: "180s",
    fingerLoad: true,
  };
  it("does not strip direct grip loading from a mixed climbing-and-hangs workout", () => {
    const s = running();
    s.templates = [
      s.templates[0],
      {
        ...session("Climb and hangs", "moderate", ["fingers", "upper"]),
        exercises: [hangs],
      },
    ];
    s.logs = [{ ...log(s.templates[1]), fingerLoad: true }];
    const r = recommend(s, fresh, now);
    expect(r.primary.intensity).toBe("rest");
    expect(r.alternative).toBeNull();
  });
  it("can offer an easy modification when only removable exercises load the fingers", () => {
    const s = running();
    s.templates = [
      s.templates[0],
      {
        ...session("Strength and hangs", "moderate", ["upper"]),
        exercises: [hangs],
      },
    ];
    s.logs = [{ ...log(s.templates[1]), fingerLoad: true }];
    const r = recommend(s, fresh, now);
    expect(r.primary.intensity).toBe("rest");
    expect(r.alternative?.omitHangs).toBe(true);
    expect(r.alternative?.intensity).toBe("easy");
  });
});
