import { addDays, inWeek, snapshotExercise } from "./model";
import type { State, PlannedSession, Exercise } from "./model";
export function moveSession(state: State, id: string, date: string): State {
  return {
    ...state,
    plans: state.plans.map((p) => (p.id === id ? { ...p, date } : p)),
  };
}
export function swapDays(state: State, a: string, b: string): State {
  return {
    ...state,
    plans: state.plans.map((p) =>
      p.date === a ? { ...p, date: b } : p.date === b ? { ...p, date: a } : p,
    ),
  };
}
export function carryPlans(state: State, currentStart: string): State {
  const previous = addDays(currentStart, -7);
  return {
    ...state,
    plans: state.plans.map((p) =>
      inWeek(p.date, previous) ? { ...p, date: addDays(p.date, 7) } : p,
    ),
  };
}
export type PlannerDrag =
  | { kind: "template"; templateId: string }
  | { kind: "plan"; templateId: string; planId: string }
  | { kind: "exercise"; templateId: string; exerciseId: string }
  | {
      kind: "planned-exercise";
      templateId: string;
      planId: string;
      exerciseId: string;
    };
export function dragExercise(
  state: Pick<State, "templates" | "plans">,
  drag: PlannerDrag,
): Exercise | undefined {
  if (drag.kind === "exercise")
    return state.templates
      .find((t) => t.id === drag.templateId)
      ?.exercises.find((e) => e.id === drag.exerciseId);
  if (drag.kind === "planned-exercise")
    return state.plans
      .find((p) => p.id === drag.planId && p.templateId === drag.templateId)
      ?.exercises?.find((e) => e.id === drag.exerciseId);
}
export function removePlannedExercise(
  state: State,
  planId: string,
  exerciseId: string,
): State {
  const plan = state.plans.find((p) => p.id === planId);
  if (!plan?.exercises?.some((e) => e.id === exerciseId)) return state;
  const remaining = plan.exercises.filter((e) => e.id !== exerciseId);
  return {
    ...state,
    plans: state.plans.flatMap((p) =>
      p.id !== planId
        ? [p]
        : remaining.length
          ? [{ ...p, exercises: remaining }]
          : [],
    ),
  };
}
function addExercise(
  state: State,
  exercise: Exercise,
  templateId: string,
  date: string,
  newId: string,
): State {
  // An existing full routine already includes its current library exercises.
  const full = state.plans.find(
    (p) =>
      p.date === date &&
      p.templateId === templateId &&
      p.exercises === undefined,
  );
  if (
    full &&
    state.templates
      .find((t) => t.id === templateId)
      ?.exercises.some((e) => e.id === exercise.id)
  )
    return state;
  const target = state.plans.find(
    (p) =>
      p.date === date &&
      p.templateId === templateId &&
      p.exercises !== undefined,
  );
  if (target?.exercises?.some((e) => e.id === exercise.id)) return state;
  if (target)
    return {
      ...state,
      plans: state.plans.map((p) =>
        p.id === target.id
          ? { ...p, exercises: [...p.exercises!, exercise] }
          : p,
      ),
    };
  return {
    ...state,
    plans: [
      ...state.plans,
      { id: newId, date, templateId, exercises: [exercise] },
    ],
  };
}
// Library activities create plans; selected exercises compose a single session.
// Moves and removals never rewrite completed workouts or actual training times.
export function dropSession(
  state: State,
  drag: PlannerDrag,
  date: string,
  newId: string,
): State {
  const template = state.templates.find((t) => t.id === drag.templateId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !template) return state;
  if (drag.kind === "plan") {
    const plan = state.plans.find(
      (p) => p.id === drag.planId && p.templateId === drag.templateId,
    );
    if (!plan || plan.date === date) return state;
    return moveSession(state, plan.id, date);
  }
  if (drag.kind === "exercise" || drag.kind === "planned-exercise") {
    const exercise = dragExercise(state, drag);
    if (!exercise) return state;
    const source =
      drag.kind === "planned-exercise"
        ? state.plans.find((p) => p.id === drag.planId)
        : undefined;
    if (source?.date === date) return state;
    const snapshot =
      drag.kind === "exercise"
        ? snapshotExercise(exercise, template)
        : exercise;
    const added = addExercise(state, snapshot, template.id, date, newId);
    if (added === state) return state;
    return source
      ? removePlannedExercise(added, source.id, exercise.id)
      : added;
  }
  return {
    ...state,
    plans: [...state.plans, { id: newId, date, templateId: template.id }],
  };
}

export function savePlannedSession(state: State, plan: PlannedSession): State {
  if (state.plans.some((p) => p.id === plan.id))
    return {
      ...state,
      plans: state.plans.map((p) => (p.id === plan.id ? plan : p)),
    };
  if (plan.exercises)
    return plan.exercises.reduce(
      (next, e) => addExercise(next, e, plan.templateId, plan.date, plan.id),
      state,
    );
  return { ...state, plans: [...state.plans, plan] };
}
