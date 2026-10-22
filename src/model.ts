export type Category = string;
export type GoalCategory = Exclude<Category, "rest">;
export type Goals = Record<GoalCategory, number>;
export const goalKeys: GoalCategory[] = ["hard", "volume", "chill", "strength"];
export const categoryLabels: Record<Category, string> = {
  hard: "Hard",
  volume: "Volume",
  chill: "Chill",
  strength: "Strength",
  rest: "Rest & mobility",
};
export type Intensity = "rest" | "easy" | "moderate" | "hard";
export type LoadTag = "fingers" | "upper" | "lower" | "cardio";
export const loadLabels: Record<LoadTag, string> = {
  fingers: "Fingers / grip",
  upper: "Upper body",
  lower: "Lower body",
  cardio: "Cardio",
};
export const intensityLabels: Record<Intensity, string> = {
  rest: "Rest / mobility",
  easy: "Easy",
  moderate: "Moderate",
  hard: "Hard",
};
export interface WorkoutType {
  id: string;
  name: string;
}
export interface TrainingTags {
  intensity: Intensity;
  loading: LoadTag[];
}
export interface Exercise {
  id: string;
  name: string;
  sets: string;
  reps: string;
  rest: string;
  fingerLoad: boolean;
  intensity?: Intensity;
  loading?: LoadTag[];
}
export interface SessionTemplate {
  id: string;
  name: string;
  category: Category;
  location: string;
  description: string;
  exercises: Exercise[];
  intensity?: Intensity;
  loading?: LoadTag[];
  typeName?: string;
}
export interface Workout {
  id: string;
  timestamp: string;
  templateId: string;
  category: Category;
  name: string;
  location: string;
  duration: number | null;
  rpe: number;
  fingers: "fresh" | "tired" | "pain";
  notes: string;
  fingerLoad: boolean;
  directFingerLoad?: boolean;
  exerciseOnly?: boolean;
  projects: Project[];
  exercises: Exercise[];
  intensity?: Intensity;
  loading?: LoadTag[];
  typeName?: string;
}
export interface Project {
  name: string;
  grade: string;
  attempts: number;
  outcome: "progress" | "sent" | "attempted";
}
export interface PlannedSession {
  id: string;
  date: string;
  templateId: string;
  // A snapshot of selected exercises. Omitted means the full workout.
  exercises?: Exercise[];
}
export interface CheckIn {
  recovery: "recovered" | "somewhat" | "very";
  fingers: "fresh" | "tired" | "pain";
  skin: "good" | "worn" | "poor";
  energy: "high" | "medium" | "low";
}
export interface Week {
  start: string;
  startDay: number;
  goals: Goals;
  notes: string;
}
export interface Settings {
  goals: Goals;
  recoveryHours: number;
  weekStart: number;
  periodStart: string;
  periodEnd: string;
}
export interface State {
  version: 1;
  types?: WorkoutType[];
  settings: Settings;
  templates: SessionTemplate[];
  logs: Workout[];
  plans: PlannedSession[];
  checkins: Record<string, CheckIn>;
  weeks: Record<string, Week>;
}
export const uid = () => crypto.randomUUID();
export function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function fromDay(s: string): Date {
  return new Date(`${s}T12:00:00`);
}
export function addDays(s: string, n: number): string {
  const d = fromDay(s);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}
export function weekStart(date: string, startDay = 1): string {
  const d = fromDay(date);
  return addDays(date, -((d.getDay() - startDay + 7) % 7));
}
export const inWeek = (date: string, start: string) =>
  date >= start && date < addDays(start, 7);
export const logDay = (l: Workout) => dayKey(new Date(l.timestamp));
export const datetimeLocal = (date: Date = new Date()) =>
  `${dayKey(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
export function weekCounts(logs: Workout[], start: string): Goals {
  const counts: Goals = { hard: 0, volume: 0, chill: 0, strength: 0 };
  for (const l of logs)
    if (l.category !== "rest" && inWeek(logDay(l), start))
      counts[l.category] = (counts[l.category] ?? 0) + 1;
  return counts;
}
export function workoutTypes(state: State): WorkoutType[] {
  return (
    state.types ??
    Object.entries(categoryLabels)
      .filter(([id]) => id !== "rest")
      .map(([id, name]) => ({ id, name }))
  );
}
export function labelsFor(state: State): Record<string, string> {
  return {
    ...categoryLabels,
    ...Object.fromEntries(workoutTypes(state).map((t) => [t.id, t.name])),
  };
}
export function trainingTags(session: SessionTemplate | Workout): TrainingTags {
  const isLog = "rpe" in session;
  const fallback: Intensity =
    session.category === "rest"
      ? "rest"
      : session.category === "hard"
        ? "hard"
        : session.category === "chill"
          ? "easy"
          : "moderate";
  let intensity = session.intensity ?? fallback;
  const loading: LoadTag[] = session.loading
    ? [...session.loading]
    : session.category === "rest"
      ? []
      : ["hard", "volume", "chill"].includes(session.category)
        ? ["fingers"]
        : ["upper", "lower"];
  if (!isLog) {
    const ranks: Record<Intensity, number> = {
      rest: 0,
      easy: 1,
      moderate: 2,
      hard: 3,
    };
    for (const e of session.exercises) {
      if (e.intensity && ranks[e.intensity] > ranks[intensity])
        intensity = e.intensity;
      for (const tag of e.loading ?? [])
        if (!loading.includes(tag)) loading.push(tag);
    }
  }
  const fingerLoad = isLog
    ? session.fingerLoad
    : session.exercises.some((e) => e.fingerLoad);
  if (fingerLoad && !loading.includes("fingers")) loading.push("fingers");
  return { intensity, loading };
}
const intensityRank: Record<Intensity, number> = {
  rest: 0,
  easy: 1,
  moderate: 2,
  hard: 3,
};
export function exerciseTags(
  exercise: Exercise,
  template: SessionTemplate,
): TrainingTags {
  // Original routines retain useful defaults without rewriting saved libraries.
  const original = template.id === "strength";
  const originalLoading: Record<string, LoadTag[]> = {
    lat: ["upper"],
    bench: ["upper"],
    y: ["upper"],
    beast: ["fingers"],
    push: ["upper"],
    legs: ["lower"],
    stretch: [],
  };
  const base = trainingTags({ ...template, exercises: [] });
  const intensity =
    exercise.intensity ??
    (original && exercise.id === "stretch" ? "rest" : base.intensity);
  const loading = [
    ...(exercise.loading ??
      (original ? originalLoading[exercise.id] : undefined) ??
      base.loading),
  ];
  if (exercise.fingerLoad && !loading.includes("fingers"))
    loading.push("fingers");
  return { intensity, loading };
}
export function snapshotExercise(
  exercise: Exercise,
  template: SessionTemplate,
): Exercise {
  return { ...exercise, ...exerciseTags(exercise, template) };
}
export function selectedTemplate(
  template: SessionTemplate,
  exercises?: Exercise[],
): SessionTemplate {
  if (exercises === undefined) return template;
  const tags = exercises.map((e) => exerciseTags(e, template));
  const intensity = tags.reduce<Intensity>(
    (max, t) =>
      intensityRank[t.intensity] > intensityRank[max] ? t.intensity : max,
    "rest",
  );
  const loading = [...new Set(tags.flatMap((t) => t.loading))];
  return {
    ...template,
    category:
      intensity === "rest" &&
      !loading.length &&
      trainingTags(template).intensity !== "rest"
        ? "rest"
        : template.category,
    name: exercises.length === 1 ? exercises[0].name : template.name,
    exercises,
    intensity,
    loading,
  };
}
export function suggestedRpe(session: SessionTemplate): number {
  return { rest: 1, easy: 3, moderate: 5, hard: 8 }[
    trainingTags(session).intensity
  ];
}
export function sessionTone(session: SessionTemplate | Workout): string {
  const tags = trainingTags(session);
  return tags.intensity === "hard"
    ? "hard"
    : tags.intensity === "easy"
      ? "chill"
      : tags.intensity === "rest"
        ? "rest"
        : tags.loading.includes("fingers")
          ? "volume"
          : "strength";
}
export function emptyProfileState(now = new Date()): State {
  const original = initialState(now);
  return {
    ...original,
    types: [],
    settings: { ...original.settings, goals: {} },
    templates: [original.templates.find((t) => t.id === "rest")!],
    weeks: {},
    logs: [],
    plans: [],
    checkins: {},
  };
}
export const defaultCheckIn: CheckIn = {
  recovery: "recovered",
  fingers: "fresh",
  skin: "good",
  energy: "medium",
};
const ex = (
  id: string,
  name: string,
  sets: string,
  reps: string,
  rest: string,
  fingerLoad = false,
): Exercise => ({ id, name, sets, reps, rest, fingerLoad });
export function initialState(now: Date = new Date()): State {
  const year = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
  const settings: Settings = {
    goals: { hard: 2, volume: 1, chill: 1, strength: 1 },
    recoveryHours: 48,
    weekStart: 1,
    periodStart: `${year}-10-01`,
    periodEnd: `${year + 1}-01-31`,
  };
  const templates: SessionTemplate[] = [
    {
      id: "kilter",
      name: "Kilter",
      category: "hard",
      location: "Kilter Board",
      description:
        "Project 8A boulders. Limit moves, long rests, quality attempts.",
      exercises: [],
    },
    {
      id: "tension",
      name: "Tension Board",
      category: "hard",
      location: "Tension Board",
      description:
        "Difficult small-hold boulders. High intensity and significant finger loading.",
      exercises: [],
    },
    {
      id: "spray",
      name: "SprayWall",
      category: "hard",
      location: "SprayWall",
      description:
        "Hard climbing, strength, and difficult moves. One of your two hard sessions.",
      exercises: [],
    },
    {
      id: "volume",
      name: "Volume",
      category: "volume",
      location: "New gym / Kilter / TB",
      description:
        "Flash-level climbing. Build movement, technique, and comfortable volume.",
      exercises: [],
    },
    {
      id: "chill",
      name: "Revolt Chill",
      category: "chill",
      location: "Revolt",
      description:
        "An easy new set, enjoyable movement, and plenty left in the tank.",
      exercises: [],
    },
    {
      id: "strength",
      name: "Strength",
      category: "strength",
      location: "Gym",
      description:
        "A balanced strength session. Sloper hangs count toward finger recovery.",
      exercises: [
        ex("lat", "Isolated one-arm lat pulldown", "3", "8–10 / arm", "120 s"),
        ex("bench", "Bench press", "3", "8–10", "120 s"),
        ex("y", "Y-prone cable", "3", "12", "60 s"),
        ex(
          "beast",
          "Beastmaker 2000 slopers",
          "5",
          "10 seconds",
          "180 s",
          true,
        ),
        ex("push", "Wide push-ups", "3", "12", "60 s"),
        ex("legs", "Leg plyometrics", "3", "6", "90 s"),
        ex("stretch", "Stretching", "1", "10 minutes", "As needed"),
      ],
    },
    {
      id: "rest",
      name: "Recovery Day",
      category: "rest",
      location: "Anywhere",
      description:
        "Complete rest, light mobility, stretching, or a relaxed walk.",
      exercises: [],
    },
  ];
  const start = weekStart(dayKey(now), settings.weekStart);
  return {
    version: 1,
    settings,
    templates,
    logs: [],
    plans: [],
    checkins: {},
    weeks: {
      [start]: {
        start,
        startDay: settings.weekStart,
        goals: { ...settings.goals },
        notes: "",
      },
    },
  };
}
export function ensureWeek(state: State, date = dayKey()): State {
  const start = weekStart(date, state.settings.weekStart);
  if (state.weeks[start]) return state;
  return {
    ...state,
    weeks: {
      ...state.weeks,
      [start]: {
        start,
        startDay: state.settings.weekStart,
        goals: { ...state.settings.goals },
        notes: "",
      },
    },
  };
}
export function weekReport(state: State, start: string): string {
  const w = state.weeks[start] ?? { goals: state.settings.goals, notes: "" };
  const logs = state.logs.filter((l) => inWeek(logDay(l), start));
  const c = weekCounts(logs, start);
  const avg = logs.length
    ? (logs.reduce((a, l) => a + l.rpe, 0) / logs.length).toFixed(1)
    : "—";
  const checkins = Object.entries(state.checkins).filter(([d]) =>
    inWeek(d, start),
  );
  const tired = checkins.filter(([, c]) => c.recovery !== "recovered").length;
  const pain =
    logs.filter((l) => l.fingers === "pain").length +
    checkins.filter(([, c]) => c.fingers === "pain").length;
  return `# Training review · ${start} to ${addDays(start, 6)}\n\n- Sessions completed: ${logs.length}\n${Object.entries(
    w.goals,
  )
    .map(
      ([id, target]) =>
        `- ${labelsFor(state)[id] ?? id}: ${c[id] ?? 0}/${target}`,
    )
    .join(
      "\n",
    )}\n- Hard-intensity sessions: ${logs.filter((l) => trainingTags(l).intensity === "hard").length}\n- Total climbing sessions: ${logs.filter((l) => ["hard", "volume", "chill"].includes(l.category)).length}\n- Average RPE: ${avg}/10\n\n## Recovery observations\n${tired} check-ins with fatigue; ${pain} reports of finger discomfort.\n${logs.filter((l) => l.fingers === "tired").length} sessions ended with tired fingers.\n\n## Sessions\n${logs.map((l) => `- ${logDay(l)} · ${l.name} · RPE ${l.rpe}${l.notes ? ` — ${l.notes}` : ""}`).join("\n") || "No sessions logged."}\n\n## Project progress\n${logs.flatMap((l) => l.projects.map((p) => `- ${p.name || "Unnamed project"} ${p.grade} · ${p.outcome} · ${p.attempts} attempts`)).join("\n") || "No projects recorded."}\n\n## Notes for next week\n${w.notes || "Leave room for recovery. Carry over only what feels useful."}`;
}
