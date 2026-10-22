import { describe, expect, it } from "vitest";
import { dropSession } from "../src/planning";
import { dayKey, initialState, weekCounts, weekStart } from "../src/model";
import type { State, Workout } from "../src/model";
const date = "2026-10-21";
const withWorkout = (): State => {
  const state = initialState(new Date(date + "T12:00:00"));
  state.logs = [
    {
      id: "actual-training",
      templateId: "kilter",
      category: "hard",
      name: "Kilter",
      timestamp: new Date(date + "T10:00:00").toISOString(),
      location: "Gym",
      duration: 60,
      rpe: 8,
      fingers: "fresh",
      notes: "Original workout",
      projects: [],
      exercises: [],
      fingerLoad: true,
    } satisfies Workout,
  ];
  return state;
};
describe("dragging workouts into the calendar", () => {
  it("adds different sessions to an occupied day without replacing any of them", () => {
    const original = withWorkout();
    const a = dropSession(
      original,
      { kind: "template", templateId: "chill" },
      date,
      "one",
    );
    const b = dropSession(
      a,
      { kind: "template", templateId: "strength" },
      date,
      "two",
    );
    expect(b.plans).toEqual([
      { id: "one", date, templateId: "chill" },
      { id: "two", date, templateId: "strength" },
    ]);
    expect(b.logs).toEqual(original.logs);
    expect(weekCounts(b.logs, weekStart(date))).toEqual({
      hard: 1,
      volume: 0,
      chill: 0,
      strength: 0,
    });
  });
  it("can drop the same workout twice as two independent planned sessions", () => {
    const a = dropSession(
      withWorkout(),
      { kind: "template", templateId: "volume" },
      date,
      "one",
    );
    const b = dropSession(
      a,
      { kind: "template", templateId: "volume" },
      date,
      "two",
    );
    expect(b.plans.map((p) => p.id)).toEqual(["one", "two"]);
    expect(b.plans.every((p) => p.date === date)).toBe(true);
  });
  it("moves one chosen plan while retaining other plans on both days and actual history", () => {
    let state = withWorkout();
    state = dropSession(
      state,
      { kind: "template", templateId: "chill" },
      date,
      "move-me",
    );
    state = dropSession(
      state,
      { kind: "template", templateId: "strength" },
      date,
      "keep-me",
    );
    state = dropSession(
      state,
      { kind: "template", templateId: "volume" },
      "2026-10-23",
      "destination",
    );
    const moved = dropSession(
      state,
      { kind: "plan", templateId: "chill", planId: "move-me" },
      "2026-10-23",
      "unused",
    );
    expect(moved.plans.map((p) => [p.id, p.date])).toEqual([
      ["move-me", "2026-10-23"],
      ["keep-me", date],
      ["destination", "2026-10-23"],
    ]);
    expect(moved.logs).toBe(state.logs);
    expect(moved.plans).toHaveLength(3);
  });
  it("dropping a plan back on its own day is a no-op", () => {
    const state = dropSession(
      withWorkout(),
      { kind: "template", templateId: "chill" },
      date,
      "one",
    );
    expect(
      dropSession(
        state,
        { kind: "plan", planId: "one", templateId: "chill" },
        date,
        "unused",
      ),
    ).toBe(state);
  });
  it("rejects stale or unknown sources without touching saved data", () => {
    const state = withWorkout();
    expect(
      dropSession(
        state,
        { kind: "template", templateId: "missing" },
        date,
        "one",
      ),
    ).toBe(state);
    expect(
      dropSession(
        state,
        { kind: "plan", planId: "missing", templateId: "chill" },
        date,
        "one",
      ),
    ).toBe(state);
  });
});
