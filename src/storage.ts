import { ensureWeek, initialState } from "./model";
import type { State } from "./model";
const KEY = "crux-planner-v1";
export function loadState(): { state: State; error: string } {
  try {
    const raw = localStorage.getItem(KEY);
    return {
      state: raw ? ensureWeek(parseBackup(raw)) : initialState(),
      error: "",
    };
  } catch {
    return {
      state: initialState(),
      error:
        "Saved data could not be read. Your existing data has been kept. Export the recovery file before saving new changes.",
    };
  }
}
export function saveState(state: State): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}
export function rawBackup(): string {
  return localStorage.getItem(KEY) ?? "";
}
const obj = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => typeof v === "string" && v.length <= 20000;
const finite = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const date = (v: unknown) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(new Date(v + "T12:00:00").getTime()) &&
  new Date(v + "T12:00:00").toLocaleDateString("en-CA") === v;
const legacyCats = ["hard", "volume", "chill", "strength", "rest"];
const choices = (v: unknown, values: string[]) =>
  typeof v === "string" && values.includes(v);
const goals = (g: unknown) =>
  obj(g) &&
  ["hard", "volume", "chill", "strength"].every(
    (k) => Number.isInteger(g[k]) && finite(g[k], 0, 14),
  );
const tagFields = (t: Record<string, any>) =>
  (t.intensity === undefined ||
    choices(t.intensity, ["rest", "easy", "moderate", "hard"])) &&
  (t.loading === undefined ||
    (Array.isArray(t.loading) &&
      new Set(t.loading).size === t.loading.length &&
      t.loading.every((v: unknown) =>
        choices(v, ["fingers", "upper", "lower", "cardio"]),
      ))) &&
  (t.typeName === undefined || str(t.typeName));
const exercise = (e: unknown) =>
  obj(e) &&
  ["id", "name", "sets", "reps", "rest"].every((k) => str(e[k])) &&
  typeof e.fingerLoad === "boolean" &&
  tagFields(e);
export function parseBackup(raw: string): State {
  if (raw.length > 10000000)
    throw Error("Backup is too large (10 MB maximum).");
  const s: unknown = JSON.parse(raw);
  const fail = () => {
    throw Error(
      "This is not a valid Crux training backup. Your current data has not changed.",
    );
  };
  if (
    !obj(s) ||
    s.version !== 1 ||
    !obj(s.settings) ||
    !Array.isArray(s.templates) ||
    !Array.isArray(s.logs) ||
    !Array.isArray(s.plans) ||
    !obj(s.weeks) ||
    !obj(s.checkins)
  )
    return fail();
  const cfg = s.settings;
  const validId = (v: unknown) =>
    str(v) &&
    !!v &&
    !["__proto__", "prototype", "constructor", "rest", "all"].includes(
      String(v),
    ) &&
    !Object.hasOwn(Object.prototype, String(v));
  if (
    s.types !== undefined &&
    (!Array.isArray(s.types) ||
      s.types.length > 100 ||
      !s.types.every(
        (t) => obj(t) && validId(t.id) && str(t.name) && t.name.trim(),
      ) ||
      new Set(s.types.map((t) => t.id)).size !== s.types.length)
  )
    return fail();
  const cats: string[] = s.types
    ? [...s.types.map((t: Record<string, any>) => t.id), "rest"]
    : legacyCats;
  const validGoals = (g: unknown) =>
    s.types
      ? obj(g) &&
        Object.entries(g).every(
          ([k, v]) =>
            cats.includes(k) &&
            k !== "rest" &&
            Number.isInteger(v) &&
            finite(v, 0, 14),
        )
      : goals(g);
  const tags = tagFields;
  if (
    !validGoals(cfg.goals) ||
    (s.types &&
      s.types.some((t: Record<string, any>) => !(t.id in cfg.goals))) ||
    !finite(cfg.recoveryHours, 24, 168) ||
    !Number.isInteger(cfg.weekStart) ||
    !finite(cfg.weekStart, 0, 6) ||
    !date(cfg.periodStart) ||
    !date(cfg.periodEnd) ||
    cfg.periodStart > cfg.periodEnd
  )
    return fail();
  if (
    !s.templates.every(
      (t) =>
        obj(t) &&
        ["id", "name", "location", "description"].every((k) => str(t[k])) &&
        t.id &&
        t.name &&
        choices(t.category, cats) &&
        tags(t) &&
        Array.isArray(t.exercises) &&
        t.exercises.every(exercise),
    )
  )
    return fail();
  if (
    (!s.types &&
      !cats.every((c) =>
        s.templates.some((t: Record<string, any>) => t.category === c),
      )) ||
    !s.templates.some(
      (t) =>
        t.category === "rest" &&
        (t.intensity === undefined || t.intensity === "rest") &&
        (!t.loading || t.loading.length === 0) &&
        t.exercises.length === 0,
    ) ||
    new Set(s.templates.map((t) => t.id)).size !== s.templates.length
  )
    return fail();
  if (
    !s.logs.every(
      (l) =>
        obj(l) &&
        ["id", "timestamp", "templateId", "name", "location", "notes"].every(
          (k) => str(l[k]),
        ) &&
        l.id &&
        l.name &&
        !Number.isNaN(Date.parse(l.timestamp)) &&
        choices(l.category, cats) &&
        tags(l) &&
        finite(l.rpe, 1, 10) &&
        Number.isInteger(l.rpe) &&
        choices(l.fingers, ["fresh", "tired", "pain"]) &&
        typeof l.fingerLoad === "boolean" &&
        (l.exerciseOnly === undefined || typeof l.exerciseOnly === "boolean") &&
        (l.directFingerLoad === undefined ||
          typeof l.directFingerLoad === "boolean") &&
        (l.duration === null || finite(l.duration, 1, 1440)) &&
        Array.isArray(l.exercises) &&
        l.exercises.every(exercise) &&
        Array.isArray(l.projects) &&
        l.projects.every(
          (p: unknown) =>
            obj(p) &&
            str(p.name) &&
            str(p.grade) &&
            Number.isInteger(p.attempts) &&
            finite(p.attempts, 1, 10000) &&
            choices(p.outcome, ["attempted", "progress", "sent"]),
        ),
    )
  )
    return fail();
  if (
    new Set(s.logs.map((l) => l.id)).size !== s.logs.length ||
    new Set(s.plans.map((p) => p.id)).size !== s.plans.length
  )
    return fail();
  if (
    !s.plans.every(
      (p) =>
        obj(p) &&
        str(p.id) &&
        date(p.date) &&
        (p.exercises === undefined ||
          (Array.isArray(p.exercises) &&
            p.exercises.length > 0 &&
            p.exercises.every(exercise) &&
            new Set(p.exercises.map((e: Record<string, any>) => e.id)).size ===
              p.exercises.length)) &&
        s.templates.some((t: Record<string, any>) => t.id === p.templateId),
    )
  )
    return fail();
  if (
    !Object.entries(s.weeks).every(
      ([k, w]) =>
        date(k) &&
        obj(w) &&
        w.start === k &&
        Number.isInteger(w.startDay) &&
        finite(w.startDay, 0, 6) &&
        validGoals(w.goals) &&
        str(w.notes),
    )
  )
    return fail();
  if (
    !Object.entries(s.checkins).every(
      ([k, c]) =>
        date(k) &&
        obj(c) &&
        choices(c.recovery, ["recovered", "somewhat", "very"]) &&
        choices(c.fingers, ["fresh", "tired", "pain"]) &&
        choices(c.skin, ["good", "worn", "poor"]) &&
        choices(c.energy, ["high", "medium", "low"]),
    )
  )
    return fail();
  return s as State;
}
export function download(
  text: string,
  name: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
