import { useState } from "react";
import { Plus, Layers } from "lucide-react";
import { dayKey, uid, weekStart, workoutTypes } from "./model";
import type { State, WorkoutType } from "./model";
export function WorkoutTypesEditor({
  state,
  onSave,
  notify,
}: {
  state: State;
  onSave: (state: State) => boolean;
  notify: (message: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newId, setNewId] = useState("");
  const save = (type: WorkoutType, target: number) => {
    const types = workoutTypes(state),
      existing = types.some((t) => t.id === type.id);
    if (!type.name.trim()) return;
    if (types.length >= 100 && !existing) {
      notify("This profile supports up to 100 workout types.");
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
      weeks: { ...state.weeks, [start]: { ...week, goals } },
    };
    if (onSave(next)) {
      setAdding(false);
      notify(
        existing
          ? "Workout type updated. Your logged history is preserved."
          : "Workout type added. Add a workout with its own intensity and loading tags.",
      );
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
