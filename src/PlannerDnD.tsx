import { useTypeLabels } from "./ProfileContext";
import { useEffect, useState, useId } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useDndContext,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type {
  CollisionDetection,
  KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import {
  Activity,
  Check,
  Dumbbell,
  Footprints,
  GripVertical,
  Leaf,
  Mountain,
  Pencil,
  Plus,
  Sparkles,
  X,
  BookOpen,
  Search,
} from "lucide-react";
import {
  fromDay,
  sessionTone,
  trainingTags,
  intensityLabels,
  selectedTemplate,
  snapshotExercise,
} from "./model";
import type {
  Category,
  PlannedSession,
  SessionTemplate,
  Exercise,
  WorkoutType,
} from "./model";
import { dragExercise } from "./planning";
import type { PlannerDrag } from "./planning";
const icons: Record<string, typeof Activity> = {
  hard: Mountain,
  volume: Activity,
  chill: Leaf,
  strength: Dumbbell,
  rest: Footprints,
};
function WorkoutIcon({
  category,
  size = 19,
}: {
  category: Category;
  size?: number;
}) {
  const I = icons[category] ?? Activity;
  return <I size={size} strokeWidth={1.7} />;
}
const labelDate = (date: string) =>
  fromDay(date).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
const collisions: CollisionDetection = (args) =>
  args.pointerCoordinates ? pointerWithin(args) : closestCenter(args);

const calendarKeyboard: KeyboardCoordinateGetter = (event, { context }) => {
  const direction = ["ArrowRight", "ArrowDown"].includes(event.code)
    ? 1
    : ["ArrowLeft", "ArrowUp"].includes(event.code)
      ? -1
      : 0;
  if (!direction) return;
  event.preventDefault();
  const days = context.droppableContainers
    .getEnabled()
    .filter((c) => c.data.current?.date)
    .sort((a, b) =>
      String(a.data.current?.date).localeCompare(String(b.data.current?.date)),
    );
  if (!days.length) return;
  const index = days.findIndex((d) => d.id === context.over?.id);
  const next =
    index < 0
      ? direction === 1
        ? 0
        : days.length - 1
      : Math.max(0, Math.min(days.length - 1, index + direction));
  const rect = context.droppableRects.get(days[next].id);
  if (rect)
    return {
      x: rect.left + (rect.width - (context.collisionRect?.width ?? 0)) / 2,
      y: rect.top + (rect.height - (context.collisionRect?.height ?? 0)) / 2,
    };
};

export function PlannerDragContext({
  children,
  templates,
  plans = [],
  onDrop,
}: {
  children: ReactNode;
  templates: SessionTemplate[];
  plans?: PlannedSession[];
  onDrop: (drag: PlannerDrag, date: string) => void;
}) {
  const categoryLabels = useTypeLabels();
  const [active, setActive] = useState<PlannerDrag | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 7 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: calendarKeyboard }),
  );
  const original = templates.find((t) => t.id === active?.templateId);
  const exercise = active
    ? dragExercise({ templates, plans }, active)
    : undefined;
  const activePlan =
    active?.kind === "plan"
      ? plans.find((p) => p.id === active.planId)
      : undefined;
  const template = original
    ? selectedTemplate(
        original,
        exercise
          ? [snapshotExercise(exercise, original)]
          : activePlan?.exercises,
      )
    : undefined;
  const reduceMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    if (active) document.body.classList.add("dragging-workout");
    else document.body.classList.remove("dragging-workout");
    return () => document.body.classList.remove("dragging-workout");
  }, [active]);
  const getName = (data: PlannerDrag) => {
    const t = templates.find((t) => t.id === data.templateId),
      e = dragExercise({ templates, plans }, data);
    const p =
      data.kind === "plan"
        ? plans.find((p) => p.id === data.planId)
        : undefined;
    return e?.name ?? (t ? selectedTemplate(t, p?.exercises).name : "Activity");
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisions}
      autoScroll={{ threshold: { x: 0.15, y: 0.2 }, acceleration: 10 }}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "Press Space to pick up this activity or exercise. Use arrow keys to choose a calendar day, then Space to drop it. Press Escape to cancel. You can place multiple sessions on a day.",
        },
        announcements: {
          onDragStart: ({ active }) =>
            `${getName(active.data.current as PlannerDrag)} picked up. Choose a calendar day.`,
          onDragOver: ({ over }) =>
            over?.data.current?.date
              ? `Drop on ${labelDate(over.data.current.date)}. Existing sessions will stay.`
              : "Move over a day to plan this activity.",
          onDragEnd: ({ over }) =>
            over?.data.current?.date
              ? `Dropped on ${labelDate(over.data.current.date)}.`
              : "Drag cancelled. Your plan has not changed.",
          onDragCancel: () => "Drag cancelled. Your plan has not changed.",
        },
      }}
      onDragStart={({ active }) =>
        setActive(active.data.current as PlannerDrag)
      }
      onDragCancel={() => setActive(null)}
      onDragEnd={({ active, over }) => {
        const data = active.data.current as PlannerDrag | undefined;
        const date = over?.data.current?.date;
        if (data && typeof date === "string") onDrop(data, date);
        setActive(null);
      }}
    >
      {children}
      {createPortal(
        <DragOverlay
          zIndex={150}
          dropAnimation={
            reduceMotion
              ? null
              : {
                  duration: 180,
                  easing: "cubic-bezier(.2,.8,.2,1)",
                  keyframes: ({ transform }) => {
                    const t = transform.initial;
                    const at = `translate3d(${t.x}px, ${t.y}px, 0)`;
                    return [
                      {
                        transform: `${at} scale(${t.scaleX}, ${t.scaleY})`,
                        opacity: 1,
                      },
                      {
                        transform: `${at} scale(${t.scaleX * 0.86}, ${t.scaleY * 0.86})`,
                        opacity: 0,
                      },
                    ];
                  },
                }
          }
        >
          {template && (
            <div
              className={`workout-bubble drag-bubble ${sessionTone(template)} ${template.category}`}
              aria-hidden="true"
            >
              <WorkoutIcon category={template.category} />
              <span>
                <strong>{template.name}</strong>
                <small>
                  {categoryLabels[template.category]} · drop into your week
                </small>
              </span>
              <GripVertical size={16} />
            </div>
          )}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

function LibraryBubble({
  template,
  exercise,
  onChoose,
}: {
  template: SessionTemplate;
  exercise?: Exercise;
  onChoose: () => void;
}) {
  const categoryLabels = useTypeLabels();
  const activity = selectedTemplate(
    template,
    exercise ? [snapshotExercise(exercise, template)] : undefined,
  );
  const drag: PlannerDrag = exercise
    ? { kind: "exercise", templateId: template.id, exerciseId: exercise.id }
    : { kind: "template", templateId: template.id };
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: exercise
      ? `exercise:${template.id}:${exercise.id}`
      : `template:${template.id}`,
    data: drag,
  });
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      className={`workout-bubble library-bubble ${sessionTone(activity)} ${isDragging ? "is-dragging" : ""}`}
      aria-label={
        exercise
          ? `Drag ${exercise.name} from ${template.name} into calendar`
          : `Drag ${template.name} into calendar`
      }
      onClick={onChoose}
    >
      <span className="bubble-symbol">
        <WorkoutIcon category={sessionTone(activity)} />
      </span>
      <span className="bubble-name">
        <strong>{activity.name}</strong>
        <small>
          {exercise
            ? `${exercise.sets} × ${exercise.reps}`
            : categoryLabels[template.category]}
          {exercise && exercise.rest ? ` · ${exercise.rest} rest` : ""}
          {exercise?.weightKg !== undefined ? ` · ${exercise.weightKg} kg` : ""}
          {!exercise && template.exercises.length > 0 ? ` · All ${template.exercises.length} exercises` : ""}
        </small>
        {exercise && (
          <span className="exercise-effort">
            {intensityLabels[trainingTags(activity).intensity]}
            {exercise.fingerLoad ? " · Finger loading" : ""}
          </span>
        )}
      </span>
      <GripVertical className="bubble-grip" size={15} />
    </button>
  );
}
export function SessionShelf({
  templates,
  types,
  category,
  onCategoryChange,
  onAddType,
  onAddWorkout,
  onChoose,
  onBrowseCatalogue,
}: {
  templates: SessionTemplate[];
  types: WorkoutType[];
  category: Category | null;
  onCategoryChange: (category: Category) => void;
  onAddType: () => void;
  onAddWorkout: (category: Category) => void;
  onChoose: (id: string, exercises?: Exercise[]) => void;
  onBrowseCatalogue?: () => void;
}) {
  const categoryLabels = useTypeLabels();
  const { active } = useDndContext();
  const [search,setSearch] = useState("");
  const categories = [...new Set([...types.map((t) => t.id), ...templates.map((t) => t.category)])].sort(
    (a, b) => (a === "rest" ? 1 : b === "rest" ? -1 : 0),
  );
  const selected = category && categories.includes(category) ? category : categories[0];
  const id = useId();
  const shown = templates.filter((t) => t.category === selected && `${t.name} ${t.location} ${t.exercises.map((e)=>e.name).join(" ")}`.toLowerCase().includes(search.trim().toLowerCase()));
  return (
    <section
      className={`session-shelf ${active ? "drag-in-progress" : ""}`}
      aria-label="Workouts to drag into your calendar"
    >
      <div className="shelf-heading">
        <div>
          <h3>
            <Sparkles size={16} />
            Workouts in this plan.
          </h3>
          <p>Pick a category, then drag an activity or exercise into a day.</p>
        </div>
        <div className="shelf-catalogue-actions">{onBrowseCatalogue && <button className="text-button" onClick={onBrowseCatalogue}><BookOpen size={15}/>Browse catalogue</button>}<span className="touch-drag-hint">Hold to lift · or tap to plan</span></div>
      </div>
      <div className="shelf-categories-row">
      <div
        className="activity-categories"
        role="tablist"
        aria-label="Workout categories"
      >
        {categories.map((c, i) => (
          <button
            key={c}
            id={`${id}-tab-${c}`}
            role="tab"
            aria-selected={c === selected}
            aria-controls={`${id}-panel`}
            tabIndex={c === selected ? 0 : -1}
            className={`activity-category ${c === selected ? "selected" : ""}`}
            onClick={() => onCategoryChange(c)}
            onKeyDown={(e) => {
              let next: number | undefined;
              if (e.key === "ArrowRight") next = (i + 1) % categories.length;
              if (e.key === "ArrowLeft")
                next = (i - 1 + categories.length) % categories.length;
              if (e.key === "Home") next = 0;
              if (e.key === "End") next = categories.length - 1;
              if (next !== undefined) {
                e.preventDefault();
                onCategoryChange(categories[next]);
                document
                  .getElementById(`${id}-tab-${categories[next]}`)
                  ?.focus();
              }
            }}
          >
            {categoryLabels[c] ?? c}
          </button>
        ))}
      </div>
      <button className="activity-category shelf-add-type" onClick={onAddType}>
        <Plus size={14} /> Add workout type
      </button>
      </div>
      <label className="catalogue-search shelf-search"><Search size={17}/><input aria-label="Search workouts in this plan" placeholder="Search this category’s workouts and exercises…" value={search} onChange={(e)=>setSearch(e.target.value)}/></label>
      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${selected}`}
        className="category-activities"
      >
        {!shown.length && <p className="shelf-empty">{search ? "No matching workouts in this category. Try another search or category." : `Add your first ${categoryLabels[selected] ?? ""} workout, then drag it into your week.`}</p>}
        {shown.some((t) => !t.exercises.length) && (
          <div className="workout-shelf">
            {shown
              .filter((t) => !t.exercises.length)
              .map((t) => (
                <LibraryBubble
                  key={t.id}
                  template={t}
                  onChoose={() => onChoose(t.id)}
                />
              ))}
          </div>
        )}
        {shown
          .filter((t) => t.exercises.length > 0)
          .map((t) => (
            <div className="routine-activities" key={t.id}>
              <div className="routine-heading">
                <span>
                  {t.name} <small>{t.exercises.length} exercises</small>
                </span>
                <button className="text-button" onClick={() => onChoose(t.id)}>
                  Plan full routine
                </button>
              </div>
              <div className="whole-routine-bubble"><LibraryBubble template={t} onChoose={()=>onChoose(t.id)}/></div>
              <div className="workout-shelf">
                {t.exercises.map((exercise) => (
                  <LibraryBubble
                    key={exercise.id}
                    template={t}
                    exercise={exercise}
                    onChoose={() =>
                      onChoose(t.id, [snapshotExercise(exercise, t)])
                    }
                  />
                ))}
              </div>
            </div>
          ))}
        {selected && <button
          className="shelf-add-workout"
          aria-label={`Add workout to ${categoryLabels[selected] ?? selected}`}
          onClick={() => onAddWorkout(selected)}
        >
          <Plus size={17} /> Add workout
        </button>}
      </div>
      <p className="shelf-footnote">
        Add as many activities as you need. Exercises from one routine build a
        single session together.
      </p>
    </section>
  );
}
export function CalendarDropDay({
  date,
  today,
  children,
}: {
  date: string;
  today: boolean;
  children: ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `day:${date}`,
    data: { date },
  });
  const { active } = useDndContext();
  return (
    <div
      ref={setNodeRef}
      data-calendar-date={date}
      className={`calendar-day ${today ? "today" : ""} ${active ? "accepts-workout" : ""} ${isOver ? "drop-target" : ""}`}
      aria-label={`${labelDate(date)}${isOver ? ", release to add session" : ""}`}
    >
      {children}
      {isOver && (
        <span className="drop-day-hint" aria-hidden="true">
          <PlusMark /> Drop here
        </span>
      )}
    </div>
  );
}
function PlusMark() {
  return <span className="drop-plus">+</span>;
}
function PlannedExercise({
  plan,
  exercise,
  onEdit,
  onRemove,
}: {
  plan: PlannedSession;
  exercise: Exercise;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `planned-exercise:${plan.id}:${exercise.id}`,
    data: {
      kind: "planned-exercise",
      planId: plan.id,
      templateId: plan.templateId,
      exerciseId: exercise.id,
    } satisfies PlannerDrag,
  });
  return (
    <div
      className={`planned-exercise ${isDragging ? "is-dragging" : ""}`}
      ref={setNodeRef}
      data-planned-exercise={exercise.id}
    >
      <button
        {...attributes}
        {...listeners}
        className="planned-exercise-grip"
        aria-label={`Drag planned ${exercise.name} to another day`}
        onClick={onEdit}
      >
        <GripVertical size={12} />
        <span>
          <strong>{exercise.name}</strong>
          <small>
            {exercise.sets} × {exercise.reps} · {exercise.rest} rest
            {exercise.weightKg !== undefined ? ` · ${exercise.weightKg} kg` : ""}
          </small>
        </span>
      </button>
      <button
        className="remove-exercise"
        onClick={onRemove}
        aria-label={`Remove ${exercise.name} from ${plan.date}`}
      >
        <X size={12} />
      </button>
    </div>
  );
}
export function DraggablePlannedSession({
  plan,
  template,
  warnings,
  onEdit,
  onComplete,
  onRemoveExercise,
}: {
  plan: PlannedSession;
  template: SessionTemplate;
  warnings: string[];
  onEdit: () => void;
  onComplete: () => void;
  onRemoveExercise: (exerciseId: string) => void;
}) {
  const activity = selectedTemplate(template, plan.exercises);
  const single = plan.exercises?.length === 1 ? plan.exercises[0] : undefined;
  const drag: PlannerDrag = single
    ? {
        kind: "planned-exercise",
        planId: plan.id,
        templateId: template.id,
        exerciseId: single.id,
      }
    : { kind: "plan", planId: plan.id, templateId: template.id };
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } =
    useDraggable({ id: `plan:${plan.id}`, data: drag });
  return (
    <div
      ref={setNodeRef}
      data-plan-id={plan.id}
      className={`calendar-session planned rounded-workout ${sessionTone(activity)} ${plan.exercises ? "has-exercises" : ""} ${isDragging ? "is-dragging" : ""}`}
    >
      <button
        className="session-title"
        onClick={onEdit}
        aria-label={`Edit ${activity.name} on ${plan.date}`}
      >
        <WorkoutIcon category={sessionTone(activity)} size={14} />
        <span>
          {activity.name}
          <small>
            {single
              ? `${single.sets} × ${single.reps} · ${single.rest} rest${single.weightKg !== undefined ? ` · ${single.weightKg} kg` : ""}`
              : plan.exercises
                ? `${plan.exercises.length} exercises · Planned`
                : "Planned"}
          </small>
        </span>
      </button>
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="plan-drag-handle"
        aria-label={`Drag planned ${activity.name} to another day`}
        title="Drag to move"
      >
        <GripVertical size={15} />
      </button>
      {plan.exercises && plan.exercises.length > 1 && (
        <div className="planned-exercise-list">
          {plan.exercises.map((exercise) => (
            <PlannedExercise
              key={exercise.id}
              plan={plan}
              exercise={exercise}
              onEdit={onEdit}
              onRemove={() => onRemoveExercise(exercise.id)}
            />
          ))}
        </div>
      )}
      {warnings.length > 0 && (
        <span
          className="plan-warning"
          title={warnings.join(" ")}
          aria-label={warnings.join(" ")}
        >
          !
        </span>
      )}
      <div className="session-actions">
        <button
          title="Move or edit"
          aria-label={`Move ${activity.name}`}
          onClick={onEdit}
        >
          <Pencil size={12} />
        </button>
        <button
          title="Mark complete"
          aria-label={`Complete ${activity.name}`}
          onClick={onComplete}
        >
          <Check size={14} />
        </button>
      </div>
    </div>
  );
}
