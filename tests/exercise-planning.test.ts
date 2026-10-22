import { describe, expect, it } from "vitest";
import {
  dropSession,
  removePlannedExercise,
  savePlannedSession,
} from "../src/planning";
import {
  initialState,
  trainingTags,
  selectedTemplate,
  snapshotExercise,
  weekCounts,
} from "../src/model";
import { planWarnings, recommend } from "../src/engine";
import { parseBackup } from "../src/storage";
import { firstProfile, parseProfileBackup } from "../src/profiles";
import type { State, Workout } from "../src/model";
const date = "2026-10-21";
const now = new Date(date + "T12:00:00");
const fresh = {
  recovery: "recovered",
  fingers: "fresh",
  skin: "good",
  energy: "high",
} as const;
const initial = () => initialState(now);
const add = (s: State, exerciseId: string, day = date, id = exerciseId) =>
  dropSession(
    s,
    { kind: "exercise", templateId: "strength", exerciseId },
    day,
    id,
  );
const workout = (s: State): Workout => {
  const t = selectedTemplate(
    s.templates.find((t) => t.id === "strength")!,
    s.plans[0].exercises,
  );
  return {
    id: "log",
    timestamp: now.toISOString(),
    templateId: t.id,
    name: t.name,
    category: t.category,
    location: t.location,
    duration: 30,
    rpe: 5,
    fingers: "fresh",
    notes: "",
    fingerLoad: t.exercises.some((e) => e.fingerLoad),
    exercises: t.exercises,
    intensity: t.intensity,
    loading: t.loading,
    exerciseOnly: true,
    projects: [],
  };
};
describe("planning actual exercises", () => {
  it("groups selected exercises into one planned session without recording completed progress", () => {
    const a = add(initial(), "bench"),
      b = add(a, "lat");
    expect(b.plans).toHaveLength(1);
    expect(b.plans[0].exercises?.map((e) => e.id)).toEqual(["bench", "lat"]);
    expect(b.logs).toHaveLength(0);
    expect(weekCounts(b.logs, "2026-10-19").strength).toBe(0);
    expect(a.plans[0].exercises).toHaveLength(1);
  });
  it("does not duplicate an exercise already planned or present in a full routine", () => {
    const a = add(initial(), "bench");
    expect(add(a, "bench")).toBe(a);
    const full = dropSession(
      initial(),
      { kind: "template", templateId: "strength" },
      date,
      "full",
    );
    expect(add(full, "bench")).toBe(full);
  });
  it("moves one exercise, preserving the remaining routine and every workout", () => {
    let s = add(add(initial(), "bench"), "lat");
    s = savePlannedSession(s, {
      ...s.plans[0],
      exercises: s.plans[0].exercises!.map((ex) =>
        ex.id === "bench" ? { ...ex, sets: "5", reps: "6", rest: "150 s" } : ex,
      ),
    });
    s.logs = [workout(s)];
    const moved = dropSession(
      s,
      {
        kind: "planned-exercise",
        templateId: "strength",
        planId: "bench",
        exerciseId: "bench",
      },
      "2026-10-23",
      "friday",
    );
    expect(
      moved.plans.map((p) => [p.date, p.exercises?.map((e) => e.id)]),
    ).toEqual([
      [date, ["lat"]],
      ["2026-10-23", ["bench"]],
    ]);
    expect(moved.logs).toBe(s.logs);
    expect(moved.plans[1].exercises?.[0]).toMatchObject({
      id: "bench",
      sets: "5",
      reps: "6",
      rest: "150 s",
    });
    expect(weekCounts(moved.logs, "2026-10-19").strength).toBe(1);
  });
  it("merges into an existing selected routine and removes an emptied source", () => {
    const s = add(add(initial(), "bench"), "lat", "2026-10-23");
    const moved = dropSession(
      s,
      {
        kind: "planned-exercise",
        templateId: "strength",
        planId: "bench",
        exerciseId: "bench",
      },
      "2026-10-23",
      "unused",
    );
    expect(moved.plans).toHaveLength(1);
    expect(moved.plans[0].exercises?.map((e) => e.id)).toEqual([
      "lat",
      "bench",
    ]);
  });
  it("leaves both days intact when the target already contains the exercise", () => {
    const s = add(add(initial(), "bench"), "bench", "2026-10-23", "friday");
    expect(
      dropSession(
        s,
        {
          kind: "planned-exercise",
          templateId: "strength",
          planId: "bench",
          exerciseId: "bench",
        },
        "2026-10-23",
        "unused",
      ),
    ).toBe(s);
  });
  it("removes only the selected item and cleans up an empty plan", () => {
    const s = add(add(initial(), "bench"), "lat");
    const a = removePlannedExercise(s, "bench", "lat");
    expect(a.plans[0].exercises?.map((e) => e.id)).toEqual(["bench"]);
    expect(removePlannedExercise(a, "bench", "bench").plans).toEqual([]);
    expect(removePlannedExercise(s, "missing", "lat")).toBe(s);
  });
  it("keeps exercise settings and tags after the library changes or removes the exercise", () => {
    const s = add(initial(), "beast");
    const snapshot = structuredClone(s.plans[0].exercises);
    s.templates.find((t) => t.id === "strength")!.exercises = [];
    expect(s.plans[0].exercises).toEqual(snapshot);
    const moved = dropSession(
      s,
      {
        kind: "planned-exercise",
        templateId: "strength",
        planId: "beast",
        exerciseId: "beast",
      },
      "2026-10-23",
      "moved",
    );
    expect(moved.plans[0].exercises?.[0].rest).toBe("180 s");
    expect(parseBackup(JSON.stringify(moved))).toEqual(moved);
  });
  it("rejects stale exercise sources and permits repeated whole climbing activities", () => {
    const s = initial();
    expect(add(s, "missing")).toBe(s);
    expect(
      dropSession(
        s,
        {
          kind: "planned-exercise",
          templateId: "strength",
          planId: "missing",
          exerciseId: "bench",
        },
        date,
        "unused",
      ),
    ).toBe(s);
    const a = dropSession(
      s,
      { kind: "template", templateId: "kilter" },
      date,
      "a",
    );
    expect(
      dropSession(a, { kind: "template", templateId: "kilter" }, date, "b")
        .plans,
    ).toHaveLength(2);
  });
  it("makes tap-to-plan compose the same session as drag-and-drop", () => {
    const s = add(initial(), "bench");
    const t = s.templates.find((t) => t.id === "strength")!;
    const saved = savePlannedSession(s, {
      id: "new",
      templateId: t.id,
      date,
      exercises: [
        snapshotExercise(t.exercises.find((e) => e.id === "lat")!, t),
      ],
    });
    expect(saved.plans).toHaveLength(1);
    expect(saved.plans[0].exercises).toHaveLength(2);
  });
  it("round trips all profiles with selected exercise snapshots", () => {
    const s = add(add(initial(), "bench"), "beast");
    s.plans[0].exercises = s.plans[0].exercises!.map((ex) => ({
      ...ex,
      sets: "4",
      reps: "12 seconds",
      rest: "3 min",
    }));
    const data = firstProfile(s);
    expect(parseProfileBackup(JSON.stringify(data))).toEqual(data);
    const bad = structuredClone(s);
    bad.plans[0].exercises = [];
    expect(() => parseBackup(JSON.stringify(bad))).toThrow();
    const dupe = structuredClone(s);
    dupe.plans[0].exercises!.push(dupe.plans[0].exercises![0]);
    expect(() => parseBackup(JSON.stringify(dupe))).toThrow();
  });
});
describe("recovery for selected exercises", () => {
  it("does not add unselected Beastmaker hangs or finger loading to bench press", () => {
    const s = add(initial(), "bench"),
      t = selectedTemplate(
        s.templates.find((t) => t.id === "strength")!,
        s.plans[0].exercises,
      );
    expect(t.exercises.map((e) => e.id)).toEqual(["bench"]);
    expect(t.loading).toEqual(["upper"]);
    s.logs = [workout(s)];
    expect(recommend(s, fresh, now).primary.category).toBe("hard");
  });
  it("counts selected Beastmaker hangs as significant finger loading", () => {
    const s = add(initial(), "beast");
    s.logs = [workout(s)];
    const r = recommend(s, fresh, now);
    expect(r.primary.category).toBe("rest");
    expect(r.hoursSinceLoad).toBe(0);
  });
  it("treats isolated stretching as recovery without filling the strength quota", () => {
    const s = add(initial(), "stretch");
    const t = selectedTemplate(
      s.templates.find((t) => t.id === "strength")!,
      s.plans[0].exercises,
    );
    expect(t.intensity).toBe("rest");
    expect(t.loading).toEqual([]);
    expect(t.category).toBe("rest");
    s.logs = [workout(s)];
    expect(weekCounts(s.logs, "2026-10-19").strength).toBe(0);
    expect(recommend(s, fresh, now).lastLoad).toBeNull();
  });
  it("warns for planned hangs, but not for unselected hangs inside a strength template", () => {
    const s = initial();
    s.plans = [{ id: "hard", templateId: "kilter", date }];
    const t = s.templates.find((t) => t.id === "strength")!;
    expect(
      planWarnings(s, date, t.id, undefined, [
        snapshotExercise(t.exercises.find((e) => e.id === "bench")!, t),
      ]).join(" "),
    ).not.toContain("within 48 hours");
    expect(
      planWarnings(s, date, t.id, undefined, [
        snapshotExercise(t.exercises.find((e) => e.id === "beast")!, t),
      ]).join(" "),
    ).toContain("within 48 hours");
  });
});

it("keeps a custom mobility type's own goal when its selected exercises are recovery", () => {
  const s = initial();
  s.types = [{ id: "mobility", name: "Stretching" }];
  s.settings.goals = { mobility: 1 };
  s.weeks = {};
  const routine = {
    id: "mobility-routine",
    category: "mobility",
    name: "Mobility",
    location: "Home",
    description: "",
    intensity: "rest" as const,
    loading: [],
    exercises: [
      {
        id: "hips",
        name: "Hip stretches",
        sets: "2",
        reps: "30s",
        rest: "30s",
        fingerLoad: false,
      },
    ],
  };
  s.templates = [s.templates.find((t) => t.id === "rest")!, routine];
  const planned = dropSession(
    s,
    { kind: "exercise", templateId: routine.id, exerciseId: "hips" },
    date,
    "hips-plan",
  );
  const t = selectedTemplate(routine, planned.plans[0].exercises);
  expect(t.category).toBe("mobility");
  const r = recommend(s, fresh, now);
  expect(r.primary.templateId).toBe(routine.id);
  expect(r.primary.reason).not.toContain("pool is complete");
});
it("includes explicit hard exercise tags when evaluating a full routine", () => {
  const s = initial(),
    t = s.templates.find((t) => t.id === "strength")!;
  t.intensity = "easy";
  t.loading = [];
  t.exercises = [
    {
      id: "sprints",
      name: "Sprints",
      sets: "4",
      reps: "20s",
      rest: "120s",
      fingerLoad: false,
      intensity: "hard",
      loading: ["lower", "cardio"],
    },
  ];
  expect(trainingTags(t)).toEqual({
    intensity: "hard",
    loading: ["lower", "cardio"],
  });
});
