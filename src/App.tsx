import { ProfileProvider, useProfiles, useTypeLabels } from "./ProfileContext";
import { AccountProvider, useAccount } from "./accounts/AccountContext";
import { AccountControl, syncLabels } from "./accounts/AccountControl";
import { SignInGate } from "./accounts/SignInGate";
import { WorkoutTypesEditor } from "./WorkoutTypesEditor";
import { Modal } from "./Modal";
import { useEffect, useRef, useState } from "react";
import { useAppStatus } from "./useAppStatus";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Dumbbell,
  Flame,
  Footprints,
  History,
  Leaf,
  MapPin,
  Menu,
  MoreHorizontal,
  Mountain,
  Plus,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
  Activity,
  Grip,
  ArrowLeftRight,
  Pencil,
  CheckCircle2,
  Upload,
  Download,
} from "lucide-react";
import {
  addDays,
  datetimeLocal,
  dayKey,
  defaultCheckIn,
  ensureWeek,
  fromDay,
  workoutTypes,
  trainingTags,
  sessionTone,
  suggestedRpe,
  exerciseTags,
  selectedTemplate,
  snapshotExercise,
  intensityLabels,
  loadLabels,
  inWeek,
  logDay,
  uid,
  weekCounts,
  weekReport,
  weekStart,
} from "./model";
import type {
  Category,
  CheckIn,
  Exercise,
  PlannedSession,
  Project,
  SessionTemplate,
  State,
  Workout,
  Intensity,
  LoadTag,
} from "./model";
import { planWarnings, recommend, significantLoad } from "./engine";
import type { Suggestion } from "./engine";
import {
  dropSession,
  swapDays,
  carryPlans,
  dragExercise,
  removePlannedExercise,
  savePlannedSession,
} from "./planning";
import type { PlannerDrag } from "./planning";
import {
  PlannerDragContext,
  SessionShelf,
  CalendarDropDay,
  DraggablePlannedSession,
} from "./PlannerDnD";
import { download } from "./storage";
const icons: Record<Category, typeof Flame> = {
  hard: Mountain,
  volume: Activity,
  chill: Leaf,
  strength: Dumbbell,
  rest: Footprints,
};
const fmtDate = (
  s: string,
  opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
) => fromDay(s).toLocaleDateString("en-GB", opts);
const hoursText = (h: number | null) =>
  h === null
    ? "No sessions yet"
    : h < 1
      ? "Less than an hour"
      : h < 48
        ? `${Math.floor(h)} hours`
        : `${Math.floor(h / 24)}d ${Math.floor(h % 24)}h`;
const Icon = ({
  category,
  size = 18,
}: {
  category: Category;
  size?: number;
}) => {
  const I = icons[category] ?? Activity;
  return <I size={size} strokeWidth={1.7} />;
};
function Badge({
  category,
  children,
}: {
  category: Category;
  children?: ReactNode;
}) {
  const categoryLabels = useTypeLabels();
  return (
    <span className={`badge ${category}`}>
      {children ?? categoryLabels[category]}
    </span>
  );
}
function Topo() {
  return (
    <svg className="topo" viewBox="0 0 480 340" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth=".8">
        {Array.from({ length: 13 }, (_, i) => (
          <path
            key={i}
            d={`M ${270 + i * 17} -30 C ${80 + i * 13} ${40 + i * 4}, ${470 - i * 16} ${110 + i * 4}, ${235 + i * 13} ${175 + i * 9} S ${150 + i * 4} ${320 + i * 10}, ${470 + i * 12} 380`}
          />
        ))}
      </g>
    </svg>
  );
}
function CheckInPanel({
  saved,
  onSave,
  fingerRelevant = true,
}: {
  saved: CheckIn | undefined;
  fingerRelevant?: boolean;
  onSave: (c: CheckIn) => void;
}) {
  const [value, setValue] = useState<CheckIn>(saved ?? defaultCheckIn);
  const [optional, setOptional] = useState(false);
  useEffect(() => setValue(saved ?? defaultCheckIn), [saved]);
  const choices = (
    label: string,
    key: keyof CheckIn,
    opts: [string, string][],
  ) => (
    <fieldset>
      <legend>{label}</legend>
      <div className="choice-row">
        {opts.map(([id, name]) => (
          <button
            key={id}
            className={`choice ${value[key] === id ? "selected" : ""}`}
            onClick={() => setValue({ ...value, [key]: id })}
            aria-pressed={value[key] === id}
          >
            {name}
          </button>
        ))}
      </div>
    </fieldset>
  );
  return (
    <div className="checkin">
      <div className="eyebrow">
        <span className="status-dot" /> YOUR DAILY CHECK-IN{" "}
        <span className="subtle">{saved ? "Saved today" : "Start here"}</span>
      </div>
      <h2>How are you feeling?</h2>
      <p className="muted">Your recovery sets the pace.</p>
      {choices("General recovery", "recovery", [
        ["recovered", "Fully recovered"],
        ["somewhat", "Somewhat fatigued"],
        ["very", "Very fatigued"],
      ])}
      {fingerRelevant &&
        choices("Finger condition", "fingers", [
          ["fresh", "Fresh"],
          ["tired", "Tired"],
          ["pain", "Pain / discomfort"],
        ])}
      <button
        className="text-button optional"
        onClick={() => setOptional(!optional)}
      >
        {optional ? "−" : "+"} {fingerRelevant ? "Skin & energy" : "Energy"}{" "}
        <span className="subtle">optional</span>
      </button>
      {optional && (
        <>
          {fingerRelevant &&
            choices("Skin", "skin", [
              ["good", "Good"],
              ["worn", "Worn"],
              ["poor", "Poor"],
            ])}
          {choices("Energy", "energy", [
            ["high", "High"],
            ["medium", "Medium"],
            ["low", "Low"],
          ])}
        </>
      )}
      <button className="button checkin-button" onClick={() => onSave(value)}>
        {saved ? "Update check-in" : "Get my recommendation"}{" "}
        <ArrowRight size={16} />
      </button>
    </div>
  );
}
function Progress({
  state,
  start,
  compact = false,
  onAdd,
}: {
  state: State;
  start: string;
  compact?: boolean;
  onAdd?: (c: Category) => void;
}) {
  const categoryLabels = useTypeLabels();
  const c = weekCounts(state.logs, start),
    goals = state.weeks[start]?.goals ?? state.settings.goals;
  return (
    <div className={`progress-grid ${compact ? "compact" : ""}`}>
      {Object.keys(goals).map((k) => (
        <div className={`progress-card ${k}`} key={k}>
          <div className="progress-top">
            <div className={`category-icon ${k}`}>
              <Icon category={k} />
            </div>
            <span className="progress-number">
              {c[k] ?? 0}
              <span> / {goals[k]}</span>
            </span>
          </div>
          <div className="progress-label">
            {categoryLabels[k]}{" "}
            <span>
              {state.types
                ? `${state.templates.filter((t) => t.category === k).length} workout option${state.templates.filter((t) => t.category === k).length === 1 ? "" : "s"}`
                : k === "hard"
                  ? "Choose any board"
                  : k === "volume"
                    ? "Movement & technique"
                    : k === "chill"
                      ? "Keep it easy"
                      : "Build your foundation"}
            </span>
          </div>
          <div className="progress-track">
            <div
              style={{
                width: `${goals[k] === 0 ? 100 : Math.min(100, ((c[k] ?? 0) / goals[k]) * 100)}%`,
              }}
            />
          </div>
          {onAdd && (
            <button
              className="pool-add"
              aria-label={`Plan ${categoryLabels[k]} session`}
              onClick={() => onAdd(k)}
            >
              <Plus size={13} /> Plan session
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
interface LogOptions {
  templateId?: string;
  date?: string;
  planId?: string;
  omitHangs?: boolean;
  edit?: Workout;
  exercises?: Exercise[];
}
function LogForm({
  state,
  options,
  onSave,
  onClose,
  onDelete,
}: {
  state: State;
  options: LogOptions;
  onSave: (l: Workout, planId?: string) => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const categoryLabels = useTypeLabels();
  const edit = options.edit;
  const [templateId, setTemplate] = useState(
    edit?.templateId ?? options.templateId ?? state.templates[0].id,
  );
  const baseTemplate =
    state.templates.find((t) => t.id === templateId) ?? state.templates[0];
  const selectedExercises =
    templateId === options.templateId ? options.exercises : undefined;
  const exerciseOnly =
    !!(edit && templateId === edit.templateId && edit.exerciseOnly) ||
    selectedExercises !== undefined;
  const template = selectedTemplate(baseTemplate, selectedExercises);
  const [rpe, setRpe] = useState(
    edit?.rpe ?? (options.omitHangs ? 3 : suggestedRpe(template)),
  );
  const [hangs, setHangs] = useState(edit?.fingerLoad ?? !options.omitHangs);
  const [projects, setProjects] = useState<Project[]>(edit?.projects ?? []);
  const [error, setError] = useState("");
  const originalExercises =
    edit && templateId === edit.templateId
      ? edit.exercises
      : template.exercises;
  // A deliberate edit can add previously omitted hangs. Existing performed
  // exercises retain their historical settings rather than the current library.
  const sessionExercises =
    edit &&
    templateId === edit.templateId &&
    !edit.fingerLoad &&
    !edit.exerciseOnly
      ? [
          ...originalExercises,
          ...template.exercises.filter(
            (e) =>
              e.fingerLoad &&
              !originalExercises.some((original) => original.id === e.id),
          ),
        ]
      : originalExercises;
  const performedExercises = sessionExercises.filter(
    (e) => !e.fingerLoad || hangs,
  );
  const performedTemplate = selectedTemplate(baseTemplate, performedExercises);
  const tags = exerciseOnly
    ? trainingTags(performedTemplate)
    : trainingTags(edit && templateId === edit.templateId ? edit : template);
  if (
    hangs &&
    sessionExercises.some((e) => e.fingerLoad) &&
    !tags.loading.includes("fingers")
  )
    tags.loading.push("fingers");
  const directFingerLoad = exerciseOnly
    ? performedExercises.some(
        (e) =>
          !e.fingerLoad &&
          exerciseTags(e, baseTemplate).loading.includes("fingers"),
      )
    : edit && templateId === edit.templateId
      ? (edit.directFingerLoad ??
        ["hard", "volume", "chill"].includes(edit.category))
      : trainingTags({ ...template, exercises: [] }).loading.includes(
          "fingers",
        );
  const actualLoading =
    !hangs && !directFingerLoad && sessionExercises.some((e) => e.fingerLoad)
      ? tags.loading.filter((tag) => tag !== "fingers")
      : tags.loading;
  const load =
    actualLoading.includes("fingers") &&
    (tags.intensity === "hard" ||
      (hangs && sessionExercises.some((e) => e.fingerLoad)));
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (exerciseOnly && !performedExercises.length) {
      setError("Keep at least one exercise, or cancel this log.");
      return;
    }
    const f = new FormData(e.currentTarget);
    const date = new Date(String(f.get("timestamp")));
    if (Number.isNaN(date.getTime()) || date.getTime() > Date.now() + 60000) {
      setError(
        "Log completed sessions at the current time or in the past. Use the planner for future sessions.",
      );
      return;
    }
    const exercises = sessionExercises;
    onSave(
      {
        id: edit?.id ?? uid(),
        templateId,
        exerciseOnly,
        category: exerciseOnly
          ? performedTemplate.category
          : edit && templateId === edit.templateId
            ? edit.category
            : template.category,
        name:
          edit && templateId === edit.templateId ? edit.name : template.name,
        timestamp: date.toISOString(),
        location: String(f.get("location")).trim(),
        duration: f.get("duration") ? Number(f.get("duration")) : null,
        rpe,
        fingers: String(f.get("fingers")) as Workout["fingers"],
        notes: String(f.get("notes")).trim(),
        fingerLoad: load,
        directFingerLoad,
        intensity: options.omitHangs ? "easy" : tags.intensity,
        loading: actualLoading,
        typeName:
          edit && templateId === edit.templateId
            ? (edit.typeName ?? categoryLabels[edit.category])
            : categoryLabels[template.category],
        projects,
        exercises: performedExercises.map((e) =>
          exerciseOnly ? snapshotExercise(e, baseTemplate) : e,
        ),
      },
      options.planId,
    );
  };
  const stamp = edit
    ? datetimeLocal(new Date(edit.timestamp))
    : options.date
      ? `${options.date}T${datetimeLocal().slice(11)}`
      : datetimeLocal();
  return (
    <Modal
      title={edit ? "Edit workout" : "Log a session"}
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="form-stack">
        <p className="muted">
          {exerciseOnly
            ? "Only the exercises you chose for this day will be logged."
            : "A quick record is enough. The details are up to you."}
        </p>
        <div className="form-grid">
          <label>
            Session
            <select
              value={templateId}
              onChange={(e) => {
                setTemplate(e.target.value);
                setHangs(!options.omitHangs);
                const t = state.templates.find((t) => t.id === e.target.value);
                setRpe(t ? suggestedRpe(t) : 1);
              }}
            >
              {state.templates.map((t) => (
                <option value={t.id} key={t.id}>
                  {exerciseOnly && t.id === templateId
                    ? (edit?.name ?? template.name)
                    : t.name}{" "}
                  ·{" "}
                  {
                    categoryLabels[
                      exerciseOnly && t.id === templateId
                        ? performedTemplate.category
                        : t.category
                    ]
                  }
                </option>
              ))}
            </select>
          </label>
          <label>
            Date & time
            <input
              name="timestamp"
              type="datetime-local"
              defaultValue={stamp}
              required
              max={datetimeLocal()}
            />
          </label>
          <label>
            Location / board
            <input
              key={templateId}
              name="location"
              defaultValue={edit?.location ?? template.location}
            />
          </label>
          <label>
            Duration <span className="subtle">optional, minutes</span>
            <input
              name="duration"
              type="number"
              min="1"
              max="1440"
              defaultValue={edit?.duration ?? ""}
              placeholder="e.g. 90"
            />
          </label>
        </div>
        <label className="range-label">
          Session effort (RPE)
          <strong>
            {rpe} <span>/ 10</span>
          </strong>
          <input
            type="range"
            min="1"
            max="10"
            value={rpe}
            onChange={(e) => setRpe(Number(e.target.value))}
          />
          <span className="range-ends">
            <span>Very easy</span>
            <span>Maximum effort</span>
          </span>
        </label>
        <label>
          {tags.loading.includes("fingers")
            ? "Fingers afterward"
            : "Finger condition (if relevant)"}
          <select name="fingers" defaultValue={edit?.fingers ?? "fresh"}>
            <option value="fresh">Fresh / comfortable</option>
            <option value="tired">Tired</option>
            <option value="pain">Pain / discomfort</option>
          </select>
        </label>
        {sessionExercises.length > 0 && (
          <div className="inset">
            {sessionExercises.some((e) => e.fingerLoad) && (
              <>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={hangs}
                    onChange={(e) => setHangs(e.target.checked)}
                  />{" "}
                  Include finger-loading exercises / hangs
                </label>
                <p className="small muted">
                  {hangs
                    ? "Hangs will count toward finger recovery."
                    : "All finger-loading exercises will be omitted from this session."}
                </p>
              </>
            )}
            <div className="routine-preview">
              {sessionExercises
                .filter((e) => !e.fingerLoad || hangs)
                .map((e) => (
                  <div key={e.id}>
                    <span>{e.name}</span>
                    <span>
                      {e.sets} × {e.reps} · {e.rest} rest
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
        <label>
          Notes <span className="subtle">optional</span>
          <textarea
            name="notes"
            rows={2}
            placeholder="What felt good? Anything to remember?"
            defaultValue={edit?.notes}
          />
        </label>
        <details className="project-details">
          <summary>
            Projects & sends <span className="subtle">optional</span>
          </summary>
          {projects.map((p, i) => (
            <div className="project-row" key={i}>
              <input
                aria-label={`Project ${i + 1} name`}
                placeholder="Project name"
                value={p.name}
                onChange={(e) =>
                  setProjects(
                    projects.map((q, j) =>
                      i === j ? { ...q, name: e.target.value } : q,
                    ),
                  )
                }
              />
              <input
                aria-label={`Project ${i + 1} grade`}
                placeholder="Grade"
                value={p.grade}
                onChange={(e) =>
                  setProjects(
                    projects.map((q, j) =>
                      i === j ? { ...q, grade: e.target.value } : q,
                    ),
                  )
                }
              />
              <input
                aria-label={`Project ${i + 1} attempts`}
                type="number"
                min="1"
                max="10000"
                value={p.attempts}
                onChange={(e) =>
                  setProjects(
                    projects.map((q, j) =>
                      i === j ? { ...q, attempts: Number(e.target.value) } : q,
                    ),
                  )
                }
              />
              <select
                aria-label={`Project ${i + 1} outcome`}
                value={p.outcome}
                onChange={(e) =>
                  setProjects(
                    projects.map((q, j) =>
                      i === j
                        ? {
                            ...q,
                            outcome: e.target.value as Project["outcome"],
                          }
                        : q,
                    ),
                  )
                }
              >
                <option value="attempted">Attempted</option>
                <option value="progress">Progress</option>
                <option value="sent">Sent ✓</option>
              </select>
              <button
                className="icon-button"
                type="button"
                aria-label="Remove project"
                onClick={() => setProjects(projects.filter((_, j) => j !== i))}
              >
                <X size={16} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-button"
            onClick={() =>
              setProjects([
                ...projects,
                { name: "", grade: "", attempts: 1, outcome: "attempted" },
              ])
            }
          >
            <Plus size={15} /> Add project
          </button>
        </details>
        {error && (
          <p role="alert" className="warning">
            {error}
          </p>
        )}
        {load && (
          <p className="small muted">
            <ShieldCheck size={14} /> Significant finger loading will be
            recorded.
          </p>
        )}
        <div className="modal-actions">
          {edit && (
            <button
              type="button"
              className="text-button danger"
              onClick={onDelete}
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button" type="submit">
            <Check size={16} /> {edit ? "Save changes" : "Save workout"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function PlanForm({
  state,
  initial,
  onSave,
  onDelete,
  onClose,
}: {
  state: State;
  initial: Partial<PlannedSession>;
  onSave: (p: PlannedSession) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const categoryLabels = useTypeLabels();
  const [date, setDate] = useState(initial.date ?? dayKey());
  const [template, setTemplate] = useState(
    initial.templateId ?? state.templates[0].id,
  );
  const [selection, setSelection] = useState<Exercise[] | undefined>(
    initial.exercises,
  );
  const routine = state.templates.find((t) => t.id === template)!;
  const exerciseOptions = [
    ...routine.exercises,
    ...(selection ?? []).filter(
      (e) => !routine.exercises.some((x) => x.id === e.id),
    ),
  ];
  const dayExercises =
    selection ?? routine.exercises.map((ex) => snapshotExercise(ex, routine));
  const updateExercise = (
    id: string,
    field: "sets" | "reps" | "rest",
    value: string,
  ) => {
    setSelection((current) =>
      (
        current ?? routine.exercises.map((ex) => snapshotExercise(ex, routine))
      ).map((ex) => (ex.id === id ? { ...ex, [field]: value } : ex)),
    );
  };
  const warnings = planWarnings(state, date, template, initial.id, selection);
  return (
    <Modal
      title={initial.id ? "Move or edit session" : "Make room for a session"}
      onClose={onClose}
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (selection && !selection.length) return;
          onSave({
            id: initial.id ?? uid(),
            date,
            templateId: template,
            ...(selection ? { exercises: selection } : {}),
          });
        }}
      >
        <p className="muted">
          A plan is a possibility. Adjust it when recovery asks.
        </p>
        <label>
          Session
          <select
            value={template}
            onChange={(e) => {
              setTemplate(e.target.value);
              setSelection(undefined);
            }}
          >
            {state.templates.map((t) => (
              <option value={t.id} key={t.id}>
                {t.name} · {categoryLabels[t.category]}
              </option>
            ))}
          </select>
        </label>
        {exerciseOptions.length > 0 && (
          <fieldset className="plan-exercise-picker">
            <legend>Exercises for this day</legend>
            <p className="small muted day-exercise-help">
              Adjust this day only. Your library and other days stay unchanged.
            </p>
            <div className="day-exercise-actions">
              <button
                type="button"
                className="text-button"
                disabled={dayExercises.length === exerciseOptions.length}
                onClick={() =>
                  setSelection(
                    exerciseOptions.map(
                      (ex) =>
                        dayExercises.find(
                          (selected) => selected.id === ex.id,
                        ) ?? snapshotExercise(ex, routine),
                    ),
                  )
                }
              >
                Select all exercises
              </button>
              <button
                type="button"
                className="text-button"
                disabled={selection === undefined || !selection.length}
                onClick={() =>
                  setSelection(
                    dayExercises.map((ex) => {
                      const original = routine.exercises.find(
                        (e) => e.id === ex.id,
                      );
                      return original
                        ? {
                            ...ex,
                            sets: original.sets,
                            reps: original.reps,
                            rest: original.rest,
                          }
                        : ex;
                    }),
                  )
                }
              >
                Reset day values
              </button>
            </div>
            <div className="plan-exercise-options">
              {exerciseOptions.map((ex) => {
                const dayExercise = dayExercises.find((e) => e.id === ex.id);
                const values = dayExercise ?? ex;
                return (
                  <div className="day-exercise" key={ex.id}>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={!!dayExercise}
                        onChange={(event) => {
                          const selected =
                            selection ??
                            routine.exercises.map((e) =>
                              snapshotExercise(e, routine),
                            );
                          setSelection(
                            event.target.checked
                              ? [...selected, snapshotExercise(ex, routine)]
                              : selected.filter((e) => e.id !== ex.id),
                          );
                        }}
                      />
                      <span>
                        {ex.name}
                        <small>
                          {values.sets} × {values.reps} · {values.rest} rest
                        </small>
                      </span>
                    </label>
                    {dayExercise && (
                      <div
                        className="day-exercise-fields"
                        role="group"
                        aria-label={`${ex.name} for this day`}
                      >
                        {(["sets", "reps", "rest"] as const).map((field) => (
                          <label key={field}>
                            {field === "sets"
                              ? "Sets"
                              : field === "reps"
                                ? "Reps / time"
                                : "Rest"}
                            <input
                              aria-label={`${ex.name} ${field} for this day`}
                              value={dayExercise[field]}
                              maxLength={200}
                              onChange={(event) =>
                                updateExercise(ex.id, field, event.target.value)
                              }
                            />
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {selection?.length === 0 && (
              <p className="warning">
                Choose at least one exercise, or remove this plan.
              </p>
            )}
          </fieldset>
        )}
        <label>
          Day
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        {warnings.map((w) => (
          <p className="warning" key={w}>
            {w}
          </p>
        ))}
        <div className="modal-actions">
          {initial.id && (
            <button
              type="button"
              className="text-button danger"
              onClick={onDelete}
            >
              <Trash2 size={15} /> Remove
            </button>
          )}
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button"
            type="submit"
            disabled={selection?.length === 0}
          >
            {initial.id ? "Save plan" : "Add to planner"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Calendar({
  state,
  start,
  onPlan,
  onLog,
  onEditLog,
  onRemoveExercise,
  onSwap,
  onPrevious,
  onNext,
  onToday,
  compact = false,
}: {
  state: State;
  start: string;
  onPlan: (p: Partial<PlannedSession>) => void;
  onLog: (o: LogOptions) => void;
  onEditLog: (l: Workout) => void;
  onRemoveExercise: (planId: string, exerciseId: string) => void;
  onSwap: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  compact?: boolean;
}) {
  return (
    <section
      className={`panel calendar-panel ${compact ? "compact-calendar" : ""}`}
    >
      <div className="section-header">
        <div>
          <h2>Your week, your way</h2>
          <p className="muted small">
            {fmtDate(start)} –{" "}
            {fmtDate(addDays(start, 6), {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="calendar-tools">
          <button className="text-button swap-button" onClick={onSwap}>
            <ArrowLeftRight size={15} /> Swap days
          </button>
          <button className="text-button" onClick={onToday}>
            Today
          </button>
          <div className="arrow-group">
            <button
              className="icon-button"
              aria-label="Previous week"
              onClick={onPrevious}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Next week"
              onClick={onNext}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>
      <div className="calendar-grid">
        {Array.from({ length: 7 }, (_, i) => {
          const date = addDays(start, i),
            today = date === dayKey();
          const plans = state.plans.filter((p) => p.date === date),
            logs = state.logs.filter((l) => logDay(l) === date);
          return (
            <CalendarDropDay key={date} date={date} today={today}>
              <div className="day-heading">
                <span>{fmtDate(date, { weekday: "short" })}</span>
                <strong>{fromDay(date).getDate()}</strong>
                {today && <span className="today-dot" />}
              </div>
              <div className="day-items">
                {logs.map((l) => (
                  <button
                    key={l.id}
                    className={`calendar-session completed ${sessionTone(l)} ${l.category}`}
                    onClick={() => onEditLog(l)}
                  >
                    <CheckCircle2 size={13} />
                    <span>
                      {l.name}
                      <small>Done · RPE {l.rpe}</small>
                    </span>
                  </button>
                ))}
                {plans.map((p) => {
                  const t = state.templates.find((t) => t.id === p.templateId);
                  if (!t) return null;
                  return (
                    <DraggablePlannedSession
                      key={p.id}
                      plan={p}
                      template={t}
                      warnings={planWarnings(
                        state,
                        date,
                        p.templateId,
                        p.id,
                        p.exercises,
                      )}
                      onEdit={() => onPlan(p)}
                      onRemoveExercise={(exerciseId) =>
                        onRemoveExercise(p.id, exerciseId)
                      }
                      onComplete={() =>
                        onLog({
                          templateId: p.templateId,
                          date,
                          planId: p.id,
                          exercises: p.exercises,
                        })
                      }
                    />
                  );
                })}
                {!plans.length && !logs.length && (
                  <span className="open-day">Room to breathe</span>
                )}
              </div>
              <button
                className="add-day"
                aria-label={`Plan session on ${date}`}
                onClick={() => onPlan({ date })}
              >
                <Plus size={15} />
                <span> Add session</span>
              </button>
            </CalendarDropDay>
          );
        })}
      </div>
      <div className="calendar-legend">
        <span>
          <i className="legend-solid" /> Completed
        </span>
        <span>
          <i className="legend-outline" /> Planned
        </span>
        <span className="calendar-hint">
          Drag a workout into any day. Drop more than one when it fits.
        </span>
      </div>
    </section>
  );
}
function ActivityList({
  logs,
  onEdit,
  onLog,
}: {
  logs: Workout[];
  onEdit: (l: Workout) => void;
  onLog: () => void;
}) {
  const categoryLabels = useTypeLabels();
  return logs.length ? (
    <div className="activity-list">
      {logs.map((l) => (
        <button className="activity-row" key={l.id} onClick={() => onEdit(l)}>
          <div className={`category-icon ${sessionTone(l)}`}>
            <Icon category={l.category} />
          </div>
          <div className="activity-name">
            <strong>{l.name}</strong>
            <span>
              {fmtDate(logDay(l))} · {l.location || categoryLabels[l.category]}
              {l.duration ? ` · ${l.duration} min` : ""}
            </span>
          </div>
          <span className="rpe">
            RPE <strong>{l.rpe}</strong>
          </span>
          <ChevronRight size={16} className="muted" />
        </button>
      ))}
    </div>
  ) : (
    <div className="empty-state">
      <div className="empty-icon">
        <Mountain size={27} strokeWidth={1.3} />
      </div>
      <h3>Your next chapter starts here</h3>
      <p>
        Log your first session. Your recovery timeline
        <br />
        and training history will grow from there.
      </p>
      <button className="text-button" onClick={onLog}>
        Log your first session <ArrowRight size={15} />
      </button>
    </div>
  );
}
function LibraryCard({
  template,
  onSave,
  isNew = false,
}: {
  isNew?: boolean;
  template: SessionTemplate;
  onSave: (t: SessionTemplate) => void;
}) {
  const { active } = useProfiles();
  const categoryLabels = useTypeLabels();
  const [t, setT] = useState(template);
  useEffect(() => setT(template), [template]);
  const setEx = (
    id: string,
    key: keyof Exercise,
    value: Exercise[keyof Exercise],
  ) =>
    setT({
      ...t,
      exercises: t.exercises.map((e) =>
        e.id === id ? { ...e, [key]: value } : e,
      ),
    });
  return (
    <details className="library-card" open={isNew ? true : undefined}>
      <summary>
        <span className={`category-icon ${sessionTone(t)}`}>
          <Icon category={t.category} />
        </span>
        <span>
          <strong>{template.name}</strong>
          <small>
            {categoryLabels[t.category]}
            {` · ${intensityLabels[trainingTags(t).intensity]}`}
          </small>
        </span>
        <ChevronRight size={18} />
      </summary>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(
            t.category === "rest"
              ? { ...t, intensity: "rest", loading: [], exercises: [] }
              : t,
          );
        }}
      >
        <div className="form-grid">
          <label>
            Session name
            <input
              required
              maxLength={120}
              value={t.name}
              onChange={(e) => setT({ ...t, name: e.target.value })}
            />
          </label>
          <label>
            Location
            <input
              value={t.location}
              onChange={(e) => setT({ ...t, location: e.target.value })}
            />
          </label>
        </div>
        <div className="form-grid">
          <label>
            Workout type
            <select
              value={t.category}
              disabled={t.category === "rest"}
              onChange={(e) => setT({ ...t, category: e.target.value })}
            >
              {workoutTypes(active.state).map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
              {t.category === "rest" && (
                <option value="rest">Rest & mobility</option>
              )}
            </select>
          </label>
          <label>
            Intensity
            <select
              value={trainingTags(t).intensity}
              disabled={t.category === "rest"}
              onChange={(e) =>
                setT({
                  ...t,
                  intensity: e.target.value as Intensity,
                  loading:
                    t.loading ?? trainingTags({ ...t, exercises: [] }).loading,
                })
              }
            >
              {Object.entries(intensityLabels).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="loading-tags" disabled={t.category === "rest"}>
          <legend>Loading tags</legend>
          <p className="small muted">
            Choose the areas this workout loads. Hard sessions sharing these
            tags need recovery. Hangs always add finger loading. No tags on a
            hard workout means overall loading.
          </p>
          <div className="tag-options">
            {Object.entries(loadLabels).map(([id, label]) => (
              <label key={id} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={trainingTags(t).loading.includes(id as LoadTag)}
                  disabled={
                    id === "fingers" && t.exercises.some((e) => e.fingerLoad)
                  }
                  onChange={(e) => {
                    const tags = trainingTags({ ...t, exercises: [] });
                    setT({
                      ...t,
                      intensity: tags.intensity,
                      loading: e.target.checked
                        ? [...tags.loading, id as LoadTag]
                        : tags.loading.filter((tag) => tag !== id),
                    });
                  }}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <label>
          Description
          <textarea
            value={t.description}
            onChange={(e) => setT({ ...t, description: e.target.value })}
          />
        </label>
        {t.exercises.length > 0 && (
          <div className="exercise-labels">
            <span>Exercise</span>
            <span>Sets</span>
            <span>Reps / time</span>
            <span>Rest</span>
          </div>
        )}
        {t.exercises.map((ex) => (
          <div className="exercise-block" key={ex.id}>
            <div className="exercise-row">
              <label className="exercise-cell exercise-name">
                <span className="exercise-field-label">Exercise</span>
                <input
                  aria-label="Exercise name"
                  required
                  value={ex.name}
                  onChange={(e) => setEx(ex.id, "name", e.target.value)}
                />
              </label>
              <label className="exercise-cell exercise-sets">
                <span className="exercise-field-label">Sets</span>
                <input
                  aria-label={`${ex.name} sets`}
                  value={ex.sets}
                  onChange={(e) => setEx(ex.id, "sets", e.target.value)}
                />
              </label>
              <label className="exercise-cell exercise-reps">
                <span className="exercise-field-label">Reps / time</span>
                <input
                  aria-label={`${ex.name} repetitions`}
                  value={ex.reps}
                  onChange={(e) => setEx(ex.id, "reps", e.target.value)}
                />
              </label>
              <label className="exercise-cell exercise-rest">
                <span className="exercise-field-label">Rest interval</span>
                <input
                  aria-label={`${ex.name} rest interval`}
                  value={ex.rest}
                  onChange={(e) => setEx(ex.id, "rest", e.target.value)}
                />
              </label>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove ${ex.name}`}
                onClick={() =>
                  setT({
                    ...t,
                    exercises: t.exercises.filter((x) => x.id !== ex.id),
                  })
                }
              >
                <X size={16} />
              </button>
            </div>
            <label className="checkbox-label small">
              <input
                type="checkbox"
                checked={ex.fingerLoad}
                onChange={(e) => setEx(ex.id, "fingerLoad", e.target.checked)}
              />{" "}
              Significant finger loading
            </label>
            <details className="exercise-tags-editor">
              <summary>
                Intensity & loading ·{" "}
                {intensityLabels[exerciseTags(ex, t).intensity]}
              </summary>
              <label>
                Exercise intensity
                <select
                  aria-label={`${ex.name} intensity`}
                  value={ex.intensity ?? "inherit"}
                  onChange={(e) =>
                    setEx(
                      ex.id,
                      "intensity",
                      e.target.value === "inherit"
                        ? undefined
                        : (e.target.value as Intensity),
                    )
                  }
                >
                  <option value="inherit">Default for this exercise</option>
                  {Object.entries(intensityLabels).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="tag-options">
                {Object.entries(loadLabels).map(([id, label]) => (
                  <label className="checkbox-label" key={id}>
                    <input
                      aria-label={`${ex.name}: ${label}`}
                      type="checkbox"
                      disabled={id === "fingers" && ex.fingerLoad}
                      checked={exerciseTags(ex, t).loading.includes(
                        id as LoadTag,
                      )}
                      onChange={(event) => {
                        const tags = exerciseTags(ex, t);
                        setEx(
                          ex.id,
                          "loading",
                          event.target.checked
                            ? [...tags.loading, id as LoadTag]
                            : tags.loading.filter((tag) => tag !== id),
                        );
                      }}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </details>
          </div>
        ))}
        {t.category !== "rest" && (
          <button
            type="button"
            className="text-button"
            onClick={() =>
              setT({
                ...t,
                exercises: [
                  ...t.exercises,
                  {
                    id: uid(),
                    name: "",
                    sets: "3",
                    reps: "10",
                    rest: "90 s",
                    fingerLoad: false,
                  },
                ],
              })
            }
          >
            <Plus size={15} /> Add exercise
          </button>
        )}
        <button className="button align-start" type="submit">
          Save session
        </button>
      </form>
    </details>
  );
}
export default function App() {
  return (
    <AccountProvider>
      <AccountWorkspace />
    </AccountProvider>
  );
}
export function AccountWorkspace() {
  const account = useAccount();
  if (!account.ready)
    return (
      <div className="account-loading" role="status">
        Restoring your sign-in…
      </div>
    );
  if (account.googleEnabled && !account.user) return <SignInGate />;
  return (
    <ProfileProvider key={account.user?.id ?? "device-only"}>
      <ActiveTrainingApp />
    </ProfileProvider>
  );
}
function ActiveTrainingApp() {
  const { active } = useProfiles();
  return <TrainingApp key={active.id} />;
}
function TrainingApp() {
  const account = useAccount();
  const profiles = useProfiles();
  const state = profiles.active.state;
  const storageReady = profiles.storageReady;
  const categoryLabels = useTypeLabels();
  const goalKeys = Object.keys(state.settings.goals);
  const [newWorkout, setNewWorkout] = useState<SessionTemplate | null>(null);
  const recoveryLogs = profiles.data.profiles.flatMap((p) => p.state.logs);
  const { online, offlineReady } = useAppStatus();
  const navToggleRef = useRef<HTMLButtonElement>(null);
  const navCloseRef = useRef<HTMLButtonElement>(null);
  const [page, setPage] = useState("dashboard");
  const [now, setNow] = useState(new Date());
  const [week, setWeek] = useState(
    weekStart(dayKey(), state.settings.weekStart),
  );
  const [logOptions, setLogOptions] = useState<LogOptions | null>(null);
  const [plan, setPlan] = useState<Partial<PlannedSession> | null>(null);
  const [swap, setSwap] = useState(false);
  const [toast, setToast] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Workout | null>(null);
  const [menu, setMenu] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [reviewWeek, setReviewWeek] = useState(week);
  const [showReport, setShowReport] = useState(false);
  const today = dayKey(now),
    currentStart = weekStart(today, state.settings.weekStart),
    checkin = state.checkins[today],
    rec = recommend(state, checkin, now, recoveryLogs);
  const sortedLogs = [...state.logs].sort(
    (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
  );
  const lastHard = sortedLogs.find(
    (l) =>
      trainingTags(l).intensity === "hard" &&
      Date.parse(l.timestamp) <= now.getTime(),
  );
  const counts = weekCounts(state.logs, currentStart);
  const goals = state.weeks[currentStart]?.goals ?? state.settings.goals;
  const completed = goalKeys.reduce(
      (a, k) => a + Math.min(counts[k] ?? 0, goals[k]),
      0,
    ),
    total = goalKeys.reduce((a, k) => a + goals[k], 0);
  const notify = (m: string) => setToast(m);
  const commit = (next: State) => profiles.commit(next);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (storageReady && !state.weeks[currentStart])
      commit(ensureWeek(state, today));
  }, [currentStart]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!menu) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    navCloseRef.current?.focus();
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setMenu(false);
      }
      if (e.key === "Tab") {
        const nodes = [
          ...document.querySelectorAll<HTMLElement>(
            ".sidebar a, .sidebar button",
          ),
        ];
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", keydown);
      navToggleRef.current?.focus();
    };
  }, [menu]);
  useEffect(() => {
    if (!window.matchMedia) return;
    const desktop = window.matchMedia("(min-width: 651px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setMenu(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  const navigate = (p: string) => {
    setPage(p);
    setMenu(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const onSaveLog = (l: Workout, planId?: string) => {
    let next: State = {
      ...state,
      logs: [...state.logs.filter((x) => x.id !== l.id), l],
      plans: planId ? state.plans.filter((p) => p.id !== planId) : state.plans,
    };
    next = ensureWeek(next, logDay(l));
    if (commit(next)) {
      setLogOptions(null);
      notify("Workout saved. Your session pool and recovery are up to date.");
    }
  };
  const onPlan = (p: PlannedSession) => {
    if (commit(savePlannedSession(state, p))) {
      setPlan(null);
      notify("Plan saved. You can move it whenever you need.");
    }
  };
  const dropWorkout = (drag: PlannerDrag, date: string) => {
    const exercise = dragExercise(state, drag);
    const original = state.templates.find((t) => t.id === drag.templateId);
    const source =
      "planId" in drag
        ? state.plans.find((p) => p.id === drag.planId)
        : undefined;
    const name =
      exercise?.name ??
      (original
        ? selectedTemplate(original, source?.exercises).name
        : "Activity");
    const next = dropSession(state, drag, date, uid());
    if (next === state) {
      if (exercise && source?.date !== date)
        notify(`${name} is already included on ${fmtDate(date)}.`);
      return;
    }
    const target =
      next.plans.find(
        (p) =>
          p.templateId === drag.templateId &&
          p.date === date &&
          (exercise
            ? p.exercises?.some((e) => e.id === exercise.id)
            : p.id === source?.id),
      ) ?? next.plans.at(-1);
    const warnings = planWarnings(
      next,
      date,
      drag.templateId,
      target?.id,
      target?.exercises,
    );
    if (commit(next))
      notify(
        `${name} ${drag.kind === "plan" || drag.kind === "planned-exercise" ? "moved" : "planned"} for ${fmtDate(date)}.${warnings.length ? " " + warnings.join(" ") : ""}`,
      );
  };
  const calendarProps = {
    state,
    start: week,
    onPlan: setPlan,
    onLog: setLogOptions,
    onEditLog: (l: Workout) => setLogOptions({ edit: l }),
    onRemoveExercise: (planId: string, exerciseId: string) => {
      if (commit(removePlannedExercise(state, planId, exerciseId)))
        notify("Exercise removed from this day.");
    },
    onSwap: () => setSwap(true),
    onPrevious: () => setWeek(addDays(week, -7)),
    onNext: () => setWeek(addDays(week, 7)),
    onToday: () => setWeek(currentStart),
  };
  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(weekReport(state, reviewWeek));
      notify("Weekly review copied as Markdown.");
    } catch {
      setShowReport(true);
      notify(
        "Clipboard unavailable. Select and copy the report, or download it.",
      );
    }
  };
  const openRec = (s: Suggestion) =>
    setLogOptions({ templateId: s.templateId, omitHangs: s.omitHangs });
  const weekStarts = [
    ...new Set([
      currentStart,
      ...Object.keys(state.weeks),
      ...state.logs.map((l) => weekStart(logDay(l), state.settings.weekStart)),
    ]),
  ]
    .sort()
    .reverse();
  const reviewLogs = state.logs.filter((l) => inWeek(logDay(l), reviewWeek));
  const reviewCounts = weekCounts(state.logs, reviewWeek);
  const avg = reviewLogs.length
    ? (reviewLogs.reduce((a, l) => a + l.rpe, 0) / reviewLogs.length).toFixed(1)
    : "—";
  return (
    <PlannerDragContext
      templates={state.templates}
      plans={state.plans}
      onDrop={dropWorkout}
    >
      <div className="app-shell">
        <aside
          id="main-navigation"
          className={`sidebar ${menu ? "mobile-open" : ""}`}
          aria-label="Training navigation"
        >
          <button
            className="icon-button nav-close"
            ref={navCloseRef}
            aria-label="Close navigation"
            onClick={() => setMenu(false)}
          >
            <X size={21} />
          </button>
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              navigate("dashboard");
            }}
          >
            <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" />
            <span>
              crux<span className="brand-dot">.</span>
            </span>
          </a>
          <div className="sidebar-label">YOUR TRAINING, IN BALANCE</div>
          <div className="profile-switcher">
            <label>
              Training profile
              <select
                value={profiles.active.id}
                onChange={(e) => profiles.switchProfile(e.target.value)}
              >
                {profiles.data.profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="text-button"
              onClick={() => profiles.setShowProfiles(true)}
            >
              <Plus size={14} />
              Manage profiles
            </button>
          </div>
          <nav aria-label="Main navigation">
            {[
              ["dashboard", "Dashboard", Mountain],
              ["planner", "Weekly planner", CalendarDays],
              ["history", "Training history", History],
              ["settings", "Settings & library", SlidersHorizontal],
            ].map(([id, label, I]) => {
              const NavIcon = I as typeof Mountain;
              return (
                <button
                  key={String(id)}
                  className={page === id ? "active" : ""}
                  aria-current={page === id ? "page" : undefined}
                  onClick={() => navigate(String(id))}
                >
                  <NavIcon size={19} strokeWidth={1.7} />
                  {String(label)}
                  {page === id && <span className="nav-dot" />}
                </button>
              );
            })}
          </nav>
          <div className="sidebar-bottom">
            <div className="season-card">
              <span className="eyebrow">THE LONG GAME</span>
              <Mountain size={70} strokeWidth={0.65} />
              <p>
                Consistency has
                <br />
                room for recovery.
              </p>
              <span>
                {fmtDate(state.settings.periodStart, {
                  month: "short",
                  year: "numeric",
                })}{" "}
                —{" "}
                {fmtDate(state.settings.periodEnd, {
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
            <div className="local-note">
              <span className="status-dot" />
              <span>
                {!storageReady
                  ? "Storage needs attention"
                  : !online
                    ? "Offline · saved on this device"
                    : account.user
                      ? syncLabels[profiles.syncStatus]
                      : "Saved on this device"}
              </span>
              <ShieldCheck size={14} />
            </div>
          </div>
        </aside>
        {menu && <div className="nav-overlay" onClick={() => setMenu(false)} />}
        <main inert={menu}>
          <header className={`topbar ${!online ? "is-offline" : ""}`}>
            <button
              className="icon-button mobile-menu"
              ref={navToggleRef}
              aria-label="Open navigation"
              aria-controls="main-navigation"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <Menu size={23} />
            </button>
            <span className="breadcrumb">
              Your training <ChevronRight size={12} />{" "}
              <strong>
                {page === "dashboard"
                  ? "Dashboard"
                  : page === "planner"
                    ? "Weekly planner"
                    : page === "history"
                      ? "Training history"
                      : "Settings & library"}
              </strong>
            </span>
            <div className="topbar-right">
              {!online && (
                <span className="connection-badge" role="status">
                  Offline
                </span>
              )}
              <span className="today-date">
                <CalendarDays size={15} />
                {now.toLocaleDateString("en-GB", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </span>
              <button
                className="active-profile-pill"
                aria-label="Manage training profiles"
                onClick={() => profiles.setShowProfiles(true)}
              >
                <span className="status-dot" />
                <span>{profiles.active.name}</span>
                <ChevronRight size={13} />
              </button>
              <AccountControl />
            </div>
          </header>
          <div className="main-content">
            {account.user && (profiles.syncMessage || profiles.conflict) && (
              <section className="cloud-notice" role="status">
                <strong>
                  {profiles.conflict
                    ? "Another device has newer changes."
                    : syncLabels[profiles.syncStatus]}
                </strong>
                <p>
                  {profiles.conflict
                    ? "Both copies are kept. Download your device copy, then choose which planner to continue with. This does not merge the copies."
                    : profiles.syncMessage}
                </p>
                {profiles.conflict ? (
                  <div className="backup-actions">
                    <button
                      className="button secondary"
                      onClick={profiles.exportBackup}
                    >
                      Download device copy
                    </button>
                    <button
                      className="button secondary"
                      onClick={() => profiles.resolveConflict("online")}
                    >
                      Use online copy
                    </button>
                    <button
                      className="button secondary"
                      onClick={() => profiles.resolveConflict("device")}
                    >
                      Keep this device’s copy online
                    </button>
                  </div>
                ) : (
                  <button
                    className="text-button"
                    onClick={() => void profiles.syncNow()}
                  >
                    Retry online saving
                  </button>
                )}
              </section>
            )}
            {!storageReady && (
              <div role="alert" className="storage-alert">
                <strong>Your saved data needs recovery.</strong>
                <p>{profiles.error}</p>
                <button
                  className="button secondary"
                  onClick={profiles.exportRecovery}
                >
                  Export original file
                </button>
                <button
                  className="button secondary"
                  onClick={profiles.requestImport}
                >
                  Import valid backup
                </button>
              </div>
            )}
            {page === "dashboard" && (
              <>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">
                      A LITTLE STRUCTURE. PLENTY OF FREEDOM.
                    </div>
                    <h1>
                      Find your next move<span className="accent">.</span>
                    </h1>
                    <p>Train with intention. Let recovery lead the way.</p>
                  </div>
                  <button className="button" onClick={() => setLogOptions({})}>
                    <Plus size={17} /> Log session
                  </button>
                </div>
                <section className="today-grid">
                  <CheckInPanel
                    key={today}
                    fingerRelevant={state.templates.some((t) =>
                      trainingTags(t).loading.includes("fingers"),
                    )}
                    saved={checkin}
                    onSave={(c) => {
                      if (
                        commit({
                          ...state,
                          checkins: { ...state.checkins, [today]: c },
                        })
                      )
                        notify("Check-in saved. Your recommendation is ready.");
                    }}
                  />
                  <div
                    className={`recommendation ${rec.primary.intensity === "easy" ? "chill" : rec.primary.intensity === "moderate" ? "volume" : rec.primary.intensity}`}
                  >
                    <Topo />
                    <div className="recommendation-content">
                      <div className="eyebrow">
                        <Sparkles size={14} /> TODAY’S RECOMMENDATION{" "}
                        <span className="live-label">
                          {checkin ? "For you" : "Check in first"}
                        </span>
                      </div>
                      <div className="recommendation-middle">
                        <div className="rec-category">
                          <Icon category={rec.primary.category} size={19} />
                          <span>
                            {`${intensityLabels[rec.primary.intensity].toUpperCase()} · ${categoryLabels[rec.primary.category] ?? "RECOVERY"}`}
                          </span>
                        </div>
                        <h2>
                          {rec.primary.intensity === "hard"
                            ? "Make it a hard day."
                            : rec.primary.intensity === "moderate"
                              ? "Find your steady pace."
                              : rec.primary.intensity === "easy"
                                ? "Keep it light today."
                                : checkin
                                  ? "Give yourself some space."
                                  : "Let’s start with you."}
                        </h2>
                        <h3>{rec.primary.title}</h3>
                        <p className="rec-reason">{rec.primary.reason}</p>
                        {rec.warnings.map((w) => (
                          <p className="rec-warning" key={w}>
                            {w}
                          </p>
                        ))}
                      </div>
                      <div className="rec-bottom">
                        <button
                          className="button cream"
                          onClick={() => openRec(rec.primary)}
                        >
                          Log this session <ArrowUpRight size={17} />
                        </button>
                        <span>Always your call.</span>
                      </div>
                      {rec.alternative && (
                        <div className="alternative">
                          <span>ALSO A GOOD OPTION</span>
                          <button onClick={() => openRec(rec.alternative!)}>
                            {rec.alternative.title}
                            <ArrowUpRight size={14} />
                          </button>
                          <p>{rec.alternative.reason}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
                <div className="section-title">
                  <div>
                    <h2>
                      This week’s session pool{" "}
                      <span className="count-pill">
                        {completed} of {total}
                      </span>
                    </h2>
                    <p>No fixed weekdays. Just a little direction.</p>
                    {workoutTypes(state).length === 0 && (
                      <button
                        className="text-button"
                        onClick={() => navigate("settings")}
                      >
                        <Plus size={15} />
                        Set up workout types & sessions
                      </button>
                    )}
                  </div>
                  <button
                    className="text-button"
                    onClick={() => navigate("planner")}
                  >
                    Plan your week <ArrowRight size={15} />
                  </button>
                </div>
                <Progress state={state} start={currentStart} />
                <SessionShelf
                  templates={state.templates}
                  onChoose={(templateId, exercises) =>
                    setPlan({ templateId, date: today, exercises })
                  }
                />
                <Calendar {...calendarProps} compact />
                <div className="dashboard-bottom">
                  <section className="panel">
                    <div className="section-header">
                      <h2>Recent activity</h2>
                      <button
                        className="text-button"
                        onClick={() => navigate("history")}
                      >
                        View history <ArrowRight size={15} />
                      </button>
                    </div>
                    <ActivityList
                      logs={sortedLogs.slice(0, 3)}
                      onEdit={(l) => setLogOptions({ edit: l })}
                      onLog={() => setLogOptions({})}
                    />
                  </section>
                  <section className="panel recovery-panel">
                    <div className="eyebrow">
                      <Clock3 size={15} /> RECOVERY WINDOW
                    </div>
                    <div className="recovery-value">
                      {rec.hoursSinceLoad === null
                        ? "A fresh start"
                        : hoursText(rec.hoursSinceLoad)}
                    </div>
                    <p className="muted">
                      {rec.lastLoad
                        ? `since ${rec.lastLoad.name}, your last significant loading session across your profiles.`
                        : "Your first logged demanding session starts your recovery timeline."}
                    </p>
                    {rec.lastLoad && (
                      <div className="recovery-bar">
                        <div
                          style={{
                            width: `${Math.min(100, ((rec.hoursSinceLoad ?? 0) / rec.requiredHours) * 100)}%`,
                          }}
                        />
                      </div>
                    )}
                    <div className="last-hard">
                      <span>LAST HARD SESSION</span>
                      <strong>
                        {lastHard
                          ? `${lastHard.name} · ${hoursText((now.getTime() - Date.parse(lastHard.timestamp)) / 3600000)} ago`
                          : "No hard sessions logged yet"}
                      </strong>
                      {lastHard && (
                        <time dateTime={lastHard.timestamp}>
                          {new Date(lastHard.timestamp).toLocaleString(
                            "en-GB",
                            {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}
                        </time>
                      )}
                    </div>
                    <div className="recovery-foot">
                      <ShieldCheck size={17} />
                      <span>
                        About {rec.requiredHours}h between high-load sessions.
                        <br />
                        How you feel matters, too.
                      </span>
                    </div>
                  </section>
                </div>
                <div className="gentle-note">
                  <Leaf size={15} /> Progress is built over weeks. Rest is part
                  of the plan.
                </div>
              </>
            )}
            {page === "planner" && (
              <>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">
                      STRUCTURE WITHOUT THE RIGIDITY
                    </div>
                    <h1>
                      Make room to train<span className="accent">.</span>
                    </h1>
                    <p>A pool of sessions. A week of possibilities.</p>
                  </div>
                  <button
                    className="button"
                    onClick={() => setPlan({ date: today })}
                  >
                    <Plus size={17} /> Plan session
                  </button>
                </div>
                <div className="section-title">
                  <div>
                    <h2>Session pool</h2>
                    <p>
                      Completed workouts fill the pool. Plans stay flexible.
                    </p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => navigate("settings")}
                  >
                    Edit goals <Settings2 size={15} />
                  </button>
                </div>
                <Progress
                  state={state}
                  start={week}
                  onAdd={(c) =>
                    setPlan({
                      date: week,
                      templateId: state.templates.find((t) => t.category === c)
                        ?.id,
                    })
                  }
                />
                <SessionShelf
                  templates={state.templates}
                  onChoose={(templateId, exercises) =>
                    setPlan({
                      templateId,
                      exercises,
                      date: inWeek(today, week) ? today : week,
                    })
                  }
                />
                <Calendar {...calendarProps} />
                <section className="panel planner-notes">
                  <div>
                    <h3>Plans can change. That’s the point.</h3>
                    <p className="muted">
                      Unfinished sessions stay in their original week without a
                      penalty. Carry them forward when they still fit. Completed
                      workouts always keep their actual dates.
                    </p>
                  </div>
                  <button
                    className="button secondary"
                    onClick={() => {
                      const previous = addDays(currentStart, -7);
                      const plans = state.plans.filter((p) =>
                        inWeek(p.date, previous),
                      );
                      if (!plans.length) {
                        notify(
                          "No uncompleted plans from last week to carry forward.",
                        );
                        return;
                      }
                      if (commit(carryPlans(state, currentStart)))
                        notify(
                          `${plans.length} plans carried forward. Check their spacing before training.`,
                        );
                    }}
                  >
                    Carry last week’s plans <ArrowRight size={15} />
                  </button>
                </section>
                <section className="panel">
                  <div className="section-header">
                    <h2>A note on double sessions</h2>
                    <Leaf size={18} />
                  </div>
                  <p className="muted padded-copy">
                    Easy movement and strength can share a day, but hangs still
                    load your fingers. The planner flags close loading; your
                    daily check-in helps you decide what feels appropriate.
                  </p>
                </section>
              </>
            )}
            {page === "history" && (
              <>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">THE BIGGER PICTURE</div>
                    <h1>
                      Every session tells a story
                      <span className="accent">.</span>
                    </h1>
                    <p>Look back, learn a little, and keep moving forward.</p>
                  </div>
                  <button className="button" onClick={() => setLogOptions({})}>
                    <Plus size={17} /> Log session
                  </button>
                </div>
                <section className="panel review-panel">
                  <div className="section-header">
                    <div>
                      <div className="eyebrow">WEEKLY REVIEW</div>
                      <h2>
                        {reviewWeek === currentStart
                          ? "This week, so far"
                          : "A week in the books"}
                      </h2>
                    </div>
                    <select
                      aria-label="Review week"
                      value={reviewWeek}
                      onChange={(e) => setReviewWeek(e.target.value)}
                    >
                      {weekStarts.map((w) => (
                        <option key={w} value={w}>
                          {fmtDate(w)} –{" "}
                          {fmtDate(addDays(w, 6), {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                          {w === currentStart ? " · Current" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="review-stats">
                    <div>
                      <strong>{reviewLogs.length}</strong>
                      <span>Sessions completed</span>
                    </div>
                    <div>
                      <strong>
                        {
                          reviewLogs.filter(
                            (l) => trainingTags(l).intensity === "hard",
                          ).length
                        }
                      </strong>
                      <span>Hard sessions</span>
                    </div>
                    <div>
                      <strong>
                        {state.types
                          ? new Set(
                              reviewLogs
                                .filter((l) => l.category !== "rest")
                                .map((l) => l.category),
                            ).size
                          : reviewLogs.filter((l) =>
                              ["hard", "volume", "chill"].includes(l.category),
                            ).length}
                      </strong>
                      <span>
                        {state.types
                          ? "Workout types trained"
                          : "Climbing sessions"}
                      </span>
                    </div>
                    <div>
                      <strong>
                        {avg}
                        <small>/10</small>
                      </strong>
                      <span>Average RPE</span>
                    </div>
                  </div>
                  <div className="review-detail">
                    <div>
                      <h3>Recovery observations</h3>
                      <p className="muted">
                        {
                          Object.entries(state.checkins).filter(
                            ([d, c]) =>
                              inWeek(d, reviewWeek) &&
                              c.recovery !== "recovered",
                          ).length
                        }{" "}
                        check-ins with fatigue ·{" "}
                        {reviewLogs.filter((l) => l.fingers === "tired").length}{" "}
                        sessions with tired fingers ·{" "}
                        {reviewLogs.filter((l) => l.fingers === "pain").length +
                          Object.entries(state.checkins).filter(
                            ([d, c]) =>
                              inWeek(d, reviewWeek) && c.fingers === "pain",
                          ).length}{" "}
                        reports of discomfort
                      </p>
                    </div>
                    <div>
                      <h3>Projects & progress</h3>
                      {reviewLogs.some((l) => l.projects.length) ? (
                        reviewLogs.flatMap((l) =>
                          l.projects.map((p, i) => (
                            <p key={`${l.id}-${i}`} className="muted">
                              {p.name || "Unnamed project"} ·{" "}
                              {p.grade || "No grade"} · {p.outcome} ·{" "}
                              {p.attempts} attempts
                            </p>
                          )),
                        )
                      ) : (
                        <p className="muted">
                          Projects will appear here when you add them to a
                          workout.
                        </p>
                      )}
                    </div>
                  </div>
                  <label className="review-notes">
                    Notes for next week
                    <textarea
                      key={reviewWeek}
                      rows={2}
                      defaultValue={state.weeks[reviewWeek]?.notes ?? ""}
                      placeholder="What would you like to carry into next week?"
                      onBlur={(e) => {
                        const w = state.weeks[reviewWeek] ?? {
                          start: reviewWeek,
                          startDay: state.settings.weekStart,
                          goals: { ...state.settings.goals },
                          notes: "",
                        };
                        if (e.target.value !== w.notes)
                          commit({
                            ...state,
                            weeks: {
                              ...state.weeks,
                              [reviewWeek]: { ...w, notes: e.target.value },
                            },
                          });
                      }}
                    />
                  </label>
                  <div className="review-actions">
                    <button className="button secondary" onClick={copyReport}>
                      <Copy size={15} /> Copy Markdown review
                    </button>
                    <button
                      className="text-button"
                      onClick={() => setShowReport(true)}
                    >
                      View full report <ArrowUpRight size={15} />
                    </button>
                  </div>
                </section>
                <div className="section-title">
                  <div>
                    <h2>
                      Training log{" "}
                      <span className="count-pill">{state.logs.length}</span>
                    </h2>
                    <p>Your workouts, exactly as you logged them.</p>
                  </div>
                </div>
                <div className="history-filters">
                  <div className="filter-tabs">
                    {["all", ...goalKeys, "rest"].map((c) => (
                      <button
                        className={historyFilter === c ? "selected" : ""}
                        onClick={() => setHistoryFilter(c)}
                        key={c}
                      >
                        {c === "all"
                          ? "All sessions"
                          : categoryLabels[c as Category]}
                      </button>
                    ))}
                  </div>
                  <input
                    aria-label="Search workouts"
                    placeholder="Search sessions, notes, projects…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <section className="panel history-list">
                  <ActivityList
                    logs={sortedLogs.filter(
                      (l) =>
                        (historyFilter === "all" ||
                          l.category === historyFilter) &&
                        `${l.name} ${l.notes} ${l.location} ${l.projects.map((p) => p.name).join(" ")}`
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                    )}
                    onEdit={(l) => setLogOptions({ edit: l })}
                    onLog={() => setLogOptions({})}
                  />
                </section>
                {state.logs.length > 1 && (
                  <section className="panel effort-panel">
                    <div className="section-header">
                      <h2>Effort over time</h2>
                      <span className="small muted">
                        Last 20 sessions · RPE 1–10
                      </span>
                    </div>
                    <div
                      className="effort-chart"
                      role="img"
                      aria-label={`Last ${Math.min(20, state.logs.length)} sessions, RPE: ${sortedLogs
                        .slice(0, 20)
                        .reverse()
                        .map((l) => l.rpe)
                        .join(", ")}`}
                    >
                      {sortedLogs
                        .slice(0, 20)
                        .reverse()
                        .map((l) => (
                          <div className="effort-column" key={l.id}>
                            <span>{l.rpe}</span>
                            <div
                              className={l.category}
                              style={{ height: `${l.rpe * 10}px` }}
                            />
                            <small>
                              {fmtDate(logDay(l), {
                                day: "numeric",
                                month: "short",
                              })}
                            </small>
                          </div>
                        ))}
                    </div>
                  </section>
                )}
              </>
            )}
            {page === "settings" && (
              <>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">MAKE IT YOURS</div>
                    <h1>
                      A plan that fits you<span className="accent">.</span>
                    </h1>
                    <p>Your goals, your sessions, your pace.</p>
                  </div>
                </div>
                <section className="panel settings-panel">
                  <div className="section-header">
                    <h2>Training preferences</h2>
                    <Settings2 size={19} />
                  </div>
                  <form
                    className="form-stack"
                    key={`${state.settings.weekStart}-${state.settings.recoveryHours}-${JSON.stringify(state.settings.goals)}`}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      const goals = Object.fromEntries(
                        goalKeys.map((k) => [k, Number(f.get(k))]),
                      );
                      const start = String(f.get("periodStart")),
                        end = String(f.get("periodEnd"));
                      if (start > end) {
                        notify("Tracking end must be after the start.");
                        return;
                      }
                      const ws = Number(f.get("weekStart"));
                      const newStart = weekStart(today, ws);
                      const settings = {
                        goals,
                        recoveryHours: Number(f.get("recoveryHours")),
                        weekStart: ws,
                        periodStart: start,
                        periodEnd: end,
                      };
                      const w = state.weeks[newStart] ?? {
                        start: newStart,
                        startDay: ws,
                        goals,
                        notes: "",
                      };
                      if (
                        commit({
                          ...state,
                          settings,
                          weeks: {
                            ...state.weeks,
                            [newStart]: { ...w, goals, startDay: ws },
                          },
                        })
                      ) {
                        setWeek(newStart);
                        setReviewWeek(newStart);
                        notify(
                          "Preferences saved. Earlier archived goals are preserved.",
                        );
                      }
                    }}
                  >
                    <div>
                      <h3>Weekly session goals</h3>
                      <p className="muted small">
                        Applies to this week and new weeks. Earlier archives
                        keep their targets.
                      </p>
                    </div>
                    <div className="goal-inputs">
                      {goalKeys.map((k) => (
                        <label key={k}>
                          {categoryLabels[k]}
                          <input
                            type="number"
                            min="0"
                            max="14"
                            name={k}
                            required
                            defaultValue={state.settings.goals[k] ?? 0}
                          />
                        </label>
                      ))}
                    </div>
                    <div className="form-grid">
                      <label>
                        Minimum recovery <span className="subtle">hours</span>
                        <input
                          type="number"
                          name="recoveryHours"
                          min="24"
                          max="168"
                          required
                          defaultValue={state.settings.recoveryHours}
                        />
                        <span className="helper">
                          Default 48h. High effort or repeated loading extends
                          the recommendation to at least 72h.
                        </span>
                      </label>
                      <label>
                        Training week starts
                        <select
                          name="weekStart"
                          defaultValue={state.settings.weekStart}
                        >
                          {[
                            "Sunday",
                            "Monday",
                            "Tuesday",
                            "Wednesday",
                            "Thursday",
                            "Friday",
                            "Saturday",
                          ].map((d, i) => (
                            <option key={d} value={i}>
                              {d}
                            </option>
                          ))}
                        </select>
                        <span className="helper">
                          Changing this regroups the calendar. Original workout
                          timestamps remain intact.
                        </span>
                      </label>
                      <label>
                        Tracking period begins
                        <input
                          type="date"
                          required
                          name="periodStart"
                          defaultValue={state.settings.periodStart}
                        />
                      </label>
                      <label>
                        Tracking period ends
                        <input
                          type="date"
                          required
                          name="periodEnd"
                          defaultValue={state.settings.periodEnd}
                        />
                        <span className="helper">
                          A season label, not a cutoff. You can keep logging
                          beyond it.
                        </span>
                      </label>
                    </div>
                    <button className="button align-start" type="submit">
                      Save preferences <Check size={15} />
                    </button>
                  </form>
                </section>
                <WorkoutTypesEditor
                  state={state}
                  onSave={commit}
                  notify={notify}
                />
                <div className="section-title">
                  <div>
                    <h2>Session library</h2>
                    <p>
                      Workouts in the same type share a weekly goal. Intensity
                      and loading tags guide your daily recommendation.
                    </p>
                  </div>
                  <button
                    className="button"
                    onClick={() => {
                      if (!workoutTypes(state).length) {
                        notify("Add a workout type below first.");
                        return;
                      }
                      setNewWorkout({
                        id: uid(),
                        name: "",
                        category: workoutTypes(state)[0].id,
                        location: "",
                        description: "",
                        exercises: [],
                        intensity: "moderate",
                        loading: [],
                      });
                    }}
                  >
                    <Plus size={16} />
                    Add workout
                  </button>
                </div>
                <div className="library-list">
                  {state.templates.map((t) => (
                    <LibraryCard
                      template={t}
                      key={t.id}
                      onSave={(t) => {
                        if (
                          commit({
                            ...state,
                            templates: state.templates.map((x) =>
                              x.id === t.id
                                ? {
                                    ...t,
                                    intensity: trainingTags(t).intensity,
                                    loading:
                                      t.loading ??
                                      trainingTags({ ...t, exercises: [] })
                                        .loading,
                                  }
                                : x,
                            ),
                          })
                        )
                          notify(
                            "Session updated. Previously logged exercises and loading are preserved.",
                          );
                      }}
                    />
                  ))}
                </div>
                <section className="panel settings-panel">
                  <div className="section-header">
                    <h2>
                      {account.user
                        ? "Your private account data"
                        : "Your data, on your device"}
                    </h2>
                    <ShieldCheck size={19} />
                  </div>
                  <p className="muted">
                    {account.user
                      ? "Your planner saves to your account and keeps an offline copy on this device. Other users cannot read it. Sign in on another device to load your saved profiles. "
                      : "Your check-ins, plans and history are saved in this browser. Sign in to keep a separate planner online and use it across devices. "}
                    Exports include all profiles in this planner; restoring
                    replaces those profiles. Keep a backup before importing.
                  </p>
                  <div className="backup-actions">
                    <button
                      className="button secondary"
                      onClick={profiles.exportBackup}
                    >
                      <Download size={16} /> Export JSON
                    </button>
                    <button
                      className="button secondary"
                      onClick={profiles.requestImport}
                    >
                      <Upload size={16} /> Import backup
                    </button>
                  </div>
                </section>
                <section className="panel settings-panel">
                  <div className="section-header">
                    <h2>Keep Crux close</h2>
                    <ArrowDownToLine size={19} />
                  </div>
                  <p className="muted">
                    On iPhone, open in Safari, tap Share, then Add to Home
                    Screen. On desktop, use your browser’s Install app option
                    when available. Load the app once online to make the local
                    app shell available offline.
                  </p>
                  <p className="offline-readiness small" role="status">
                    {offlineReady
                      ? "Offline access is ready on this device."
                      : "Open online once to prepare offline access. This browser must support service workers."}
                  </p>
                  <p className="small muted">
                    Recovery suggestions are training guidelines, not medical
                    diagnoses or injury-prevention guarantees. Override them
                    when needed. Finger discomfort takes priority over a quota.
                  </p>
                </section>
              </>
            )}
            <footer className="footer">
              <span>
                <Mountain size={14} /> crux.{" "}
                <span className="footer-divider">/</span> Train for the long
                game.
              </span>
              <span>Made for a flexible kind of progress.</span>
              <nav className="footer-legal" aria-label="Privacy and terms">
                <a href={`${import.meta.env.BASE_URL}privacy.html`}>Privacy</a>
                <a href={`${import.meta.env.BASE_URL}terms.html`}>Terms</a>
              </nav>
            </footer>
          </div>
        </main>

        {logOptions && (
          <LogForm
            key={
              logOptions.edit?.id ??
              logOptions.planId ??
              logOptions.templateId ??
              "quick-log"
            }
            state={state}
            options={logOptions}
            onSave={onSaveLog}
            onClose={() => setLogOptions(null)}
            onDelete={() => {
              if (logOptions.edit) {
                setConfirmDelete(logOptions.edit);
                setLogOptions(null);
              }
            }}
          />
        )}
        {plan && (
          <PlanForm
            key={
              plan.id ??
              `${plan.templateId}-${plan.exercises?.map((e) => e.id).join(",") ?? "full"}`
            }
            state={state}
            initial={plan}
            onSave={onPlan}
            onDelete={() => {
              if (
                commit({
                  ...state,
                  plans: state.plans.filter((p) => p.id !== plan.id),
                })
              ) {
                setPlan(null);
                notify("Plan removed.");
              }
            }}
            onClose={() => setPlan(null)}
          />
        )}
        {swap && (
          <Modal title="Swap two days" onClose={() => setSwap(false)}>
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget),
                  a = String(f.get("a")),
                  b = String(f.get("b"));
                if (a === b) {
                  notify("Choose two different days.");
                  return;
                }
                if (commit(swapDays(state, a, b))) {
                  setSwap(false);
                  notify(
                    "Planned sessions swapped. Completed workouts keep their actual timestamps. Check loading before training.",
                  );
                }
              }}
            >
              <p className="muted">
                Swap all planned sessions between two days. Completed workouts
                retain the day you trained.
              </p>
              <label>
                First day
                <input type="date" name="a" defaultValue={week} required />
              </label>
              <label>
                Second day
                <input
                  type="date"
                  name="b"
                  defaultValue={addDays(week, 1)}
                  required
                />
              </label>
              <button className="button" type="submit">
                <ArrowLeftRight size={16} /> Swap planned sessions
              </button>
            </form>
          </Modal>
        )}
        {confirmDelete && (
          <Modal
            title="Delete this workout?"
            onClose={() => setConfirmDelete(null)}
          >
            <p className="muted">
              {confirmDelete.name} on {fmtDate(logDay(confirmDelete))} will be
              removed from your history. Your weekly progress and recovery will
              update.
            </p>
            <div className="modal-actions">
              <button
                className="button secondary"
                onClick={() => setConfirmDelete(null)}
              >
                Keep workout
              </button>
              <button
                className="button danger-button"
                onClick={() => {
                  if (
                    commit({
                      ...state,
                      logs: state.logs.filter((l) => l.id !== confirmDelete.id),
                    })
                  ) {
                    setConfirmDelete(null);
                    notify("Workout deleted.");
                  }
                }}
              >
                Delete workout
              </button>
            </div>
          </Modal>
        )}
        {newWorkout && (
          <Modal title="Add a workout" onClose={() => setNewWorkout(null)} wide>
            <LibraryCard
              template={newWorkout}
              isNew
              onSave={(t) => {
                if (commit({ ...state, templates: [...state.templates, t] })) {
                  setNewWorkout(null);
                  notify("Workout added. Recommendations now use its tags.");
                }
              }}
            />
          </Modal>
        )}
        {showReport && (
          <Modal
            title="Your weekly review"
            onClose={() => setShowReport(false)}
            wide
          >
            <textarea
              className="report-text"
              aria-label="Weekly report Markdown"
              readOnly
              value={weekReport(state, reviewWeek)}
              rows={18}
              onFocus={(e) => e.target.select()}
            />
            <div className="modal-actions">
              <button
                className="button secondary"
                onClick={() =>
                  download(
                    weekReport(state, reviewWeek),
                    `crux-week-${reviewWeek}.md`,
                    "text/markdown",
                  )
                }
              >
                <Download size={15} /> Download Markdown
              </button>
              <button className="button" onClick={copyReport}>
                <Copy size={15} /> Copy review
              </button>
            </div>
          </Modal>
        )}
        {toast && (
          <div role="status" className="toast">
            <CheckCircle2 size={18} />
            <span>{toast}</span>
            <button
              aria-label="Dismiss notification"
              onClick={() => setToast("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </PlannerDragContext>
  );
}
