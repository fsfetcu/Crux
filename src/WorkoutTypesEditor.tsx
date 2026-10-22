import { useState } from "react";
import { Plus, Layers } from "lucide-react";
import { dayKey, uid, weekStart, workoutTypes } from "./model";
import type { State, WorkoutType } from "./model";
export function WorkoutTypesEditor({
  state,
  onSave,
  notify,
  createOnly = false,
  onCreated,
}: {
  state: State;
  onSave: (state: State) => boolean;
  notify: (message: string) => void;
  createOnly?: boolean;
  onCreated?: (id: string) => void;
}) {
  const [adding, setAdding] = useState(createOnly);
  const [newId, setNewId] = useState(() => "type-" + uid());
  const [error, setError] = useState("");
  const save = (type: WorkoutType, target: number) => {
    setError("");
    const types = workoutTypes(state),
      existing = types.some((t) => t.id === type.id);
    if (!type.name.trim()) {
      setError("Enter a name for this workout type.");
      return;
    }
    if ([...types, { id: "rest", name: "Rest & mobility" }].some((t) =>
      t.id !== type.id && t.name.trim().toLowerCase() === type.name.trim().toLowerCase(),
    )) {
      setError("A workout type with this name already exists. Choose another name.");
      return;
    }
    if (types.length >= 100 && !existing) {
      setError("This profile supports up to 100 workout types.");
      return;
    }
    if (!Number.isInteger(target) || target < 0 || target > 14) {
      setError("Choose a weekly target from 0 to 14.");
      return;
    }
    const goals = { ...state.settings.goals, [type.id]: target };
    const start = weekStart(dayKey(), state.settings.weekStart);
    const week = state.weeks[start] ?? {
      start,
      startDay: state.settings.weekStart,
      goals,
      notes: "",
    };
    const next = {
      ...state,
      types: existing
        ? types.map((t) =>
            t.id === type.id ? { ...type, name: type.name.trim() } : t,
          )
        : [...types, { ...type, name: type.name.trim() }],
      settings: { ...state.settings, goals },
      weeks: {
        ...state.weeks,
        [start]: { ...week, goals: { ...week.goals, [type.id]: target } },
      },
    };
    if (onSave(next)) {
      setAdding(false);
      notify(
        existing
          ? "Workout type updated. Your logged history is preserved."
          : "Workout type added. Add a workout with its own intensity and loading tags.",
      );
      if (!existing) onCreated?.(type.id);
    } else {
      setError("The workout type could not be saved. Please try again.");
    }
  };
  const row = (type: WorkoutType, isNew = false) => (
    <form
      key={type.id + type.name}
      className="type-editor-row"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        save(
          { id: type.id, name: String(f.get("typeName")) },
          Number(f.get("target")),
        );
      }}
    >
      <label>
        {isNew ? "New workout type" : "Workout type name"}
        <input
          name="typeName"
          required
          maxLength={120}
          defaultValue={type.name}
          placeholder="e.g. Running, Strength, Yoga"
        />
      </label>
      <label>
        Weekly target
        <input
          name="target"
          type="number"
          min={0}
          max={14}
          required
          defaultValue={state.settings.goals[type.id] ?? 1}
        />
      </label>
      <button className="button secondary">
        {isNew ? "Create type" : "Save type"}
      </button>
    </form>
  );
  if (createOnly) return (
    <div>
      <p className="muted">Create a group such as Running, Yoga or another climbing style. Its workouts share one weekly target.</p>
      {row({ id: newId, name: "" }, true)}
      {error && <p role="alert" className="warning">{error}</p>}
    </div>
  );
  return (
    <section className="panel settings-panel workout-types">
      <div className="section-header">
        <h2>Workout types</h2>
        <Layers size={19} />
      </div>
      <p className="muted">
        Name the groups in this profile’s weekly pool. Workouts sharing a type
        count toward one target. Each workout has its own intensity and loading
        tags.
      </p>
      {workoutTypes(state).map((type) => row(type))}
      {error && <p role="alert" className="warning">{error}</p>}
      {adding ? (
        row({ id: newId, name: "" }, true)
      ) : (
        <button
          className="text-button"
          onClick={() => {
            setNewId("type-" + uid());
            setAdding(true);
          }}
        >
          <Plus size={15} />
          Add workout type
        </button>
      )}
    </section>
  );
}
