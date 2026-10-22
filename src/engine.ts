import {
  dayKey,
  weekStart,
  weekCounts,
  inWeek,
  labelsFor,
  trainingTags,
  selectedTemplate,
  loadLabels,
} from "./model";
import type {
  State,
  CheckIn,
  Workout,
  Category,
  SessionTemplate,
  Intensity,
  LoadTag,
  Exercise,
} from "./model";
export interface Suggestion {
  category: Category;
  title: string;
  reason: string;
  templateId: string;
  intensity: Intensity;
  omitHangs?: boolean;
}
export interface Recommendation {
  primary: Suggestion;
  alternative: Suggestion | null;
  hoursSinceLoad: number | null;
  requiredHours: number;
  lastLoad: Workout | null;
  warnings: string[];
  needsCheckin: boolean;
}
export function significantLoad(l: Workout): boolean {
  return trainingTags(l).intensity === "hard" || l.fingerLoad || l.rpe >= 8;
}
const overlaps = (a: LoadTag[], b: LoadTag[]) =>
  !a.length || !b.length || a.some((tag) => b.includes(tag));
const rank: Record<Intensity, number> = {
  rest: 0,
  easy: 1,
  moderate: 2,
  hard: 3,
};
export function recommend(
  state: State,
  checkin: CheckIn | undefined,
  now = new Date(),
  recoveryLogs: Workout[] = state.logs,
): Recommendation {
  const recent = recoveryLogs
    .filter((l) => Date.parse(l.timestamp) <= now.getTime())
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  const lastLoad = recent.find(significantLoad) ?? null;
  const hours = lastLoad
    ? (now.getTime() - Date.parse(lastLoad.timestamp)) / 3600000
    : null;
  const recent72 = recent.filter(
    (l) => now.getTime() - Date.parse(l.timestamp) < 72 * 3600000,
  );
  const intense = recent72.filter(significantLoad);
  const base = state.settings.recoveryHours;
  const requiredHours = Math.max(
    base,
    lastLoad && lastLoad.rpe >= 9 ? 72 : base,
    intense.length >= 2 ? 72 : base,
  );
  const start = weekStart(dayKey(now), state.settings.weekStart);
  // Recovery crosses profile/week boundaries; quotas only count this profile.
  const counts = weekCounts(
    state.logs.filter((l) => Date.parse(l.timestamp) <= now.getTime()),
    start,
  );
  const goals = state.weeks[start]?.goals ?? state.settings.goals;
  const labels = labelsFor(state);
  const remain = (t: SessionTemplate) =>
    (counts[t.category] ?? 0) < (goals[t.category] ?? 0);
  const safeRest = (t: SessionTemplate) =>
    trainingTags(t).intensity === "rest" &&
    !trainingTags(t).loading.length &&
    !t.exercises.some((e) => e.fingerLoad);
  const restTemplate =
    state.templates.find(
      (t) => t.category !== "rest" && remain(t) && safeRest(t),
    ) ??
    state.templates.find((t) => t.category === "rest" && safeRest(t)) ??
    state.templates.find(safeRest);
  const make = (
    t: SessionTemplate,
    reason: string,
    omitHangs = false,
  ): Suggestion => ({
    category: t.category,
    title: t.name + (omitHangs ? " · no finger loading" : ""),
    reason,
    templateId: t.id,
    intensity: omitHangs ? "easy" : trainingTags(t).intensity,
    omitHangs,
  });
  const rest = (reason: string): Suggestion =>
    restTemplate
      ? make(restTemplate, reason)
      : {
          category: "rest",
          title: "Recovery Day",
          templateId: "rest",
          reason,
          intensity: "rest",
        };
  const candidates = state.templates.filter(
    (t) => trainingTags(t).intensity !== "rest" && remain(t),
  );
  const windowFor = (t: SessionTemplate) => {
    const tags = trainingTags(t);
    const loads = recent.filter(
      (l) =>
        significantLoad(l) && overlaps(trainingTags(l).loading, tags.loading),
    );
    const last = loads[0];
    const required = Math.max(
      base,
      last?.rpe >= 9 ? 72 : base,
      loads.filter(
        (l) => now.getTime() - Date.parse(l.timestamp) < 72 * 3600000,
      ).length >= 2
        ? 72
        : base,
    );
    const elapsed = last
      ? (now.getTime() - Date.parse(last.timestamp)) / 3600000
      : null;
    return { last, required, elapsed };
  };
  const safe = (t: SessionTemplate) => {
    const tags = trainingTags(t),
      window = windowFor(t);
    if (
      tags.loading.includes("fingers") &&
      checkin &&
      (checkin.fingers !== "fresh" || checkin.skin !== "good")
    )
      return false;
    if (
      (tags.intensity === "hard" ||
        (tags.loading.includes("fingers") &&
          t.exercises.some((e) => e.fingerLoad))) &&
      window.elapsed !== null &&
      window.elapsed < window.required
    )
      return false;
    // Moderate work on freshly loaded areas can still become a second demanding session.
    if (
      tags.intensity === "moderate" &&
      window.elapsed !== null &&
      window.elapsed < 24
    )
      return false;
    return true;
  };
  const sorted = [...candidates].sort(
    (a, b) => rank[trainingTags(b).intensity] - rank[trainingTags(a).intensity],
  );
  const easy = sorted.find(
    (t) => trainingTags(t).intensity === "easy" && safe(t),
  );
  const noHangs = state.templates.find(
    (t) =>
      (goals[t.category] ?? 0) > 0 &&
      !trainingTags({ ...t, exercises: [] }).loading.includes("fingers") &&
      t.exercises.some((e) => e.fingerLoad) &&
      trainingTags(t).intensity !== "hard",
  );
  const noHangsAlternative = () =>
    noHangs
      ? make(
          noHangs,
          "If you feel fresh overall, keep this session light and remove all finger-loading exercises. Do not add hard effort to compensate.",
          true,
        )
      : null;
  const warnings: string[] = [];
  let primary: Suggestion,
    alternative: Suggestion | null = null;
  const discomfort = recent72.some((l) => l.fingers === "pain");
  if (!checkin)
    primary = rest(
      "Check in first so your recommendation can reflect how you feel today.",
    );
  else if (checkin.fingers === "pain" || discomfort) {
    primary = rest(
      checkin.fingers === "pain"
        ? "Finger discomfort takes priority over the plan. Avoid climbing, hangs, and anything that aggravates it; choose comfortable rest or gentle mobility."
        : "Recent finger discomfort is still relevant even if today feels better. Choose comfortable recovery and avoid aggravating finger loading.",
    );
    if (discomfort)
      warnings.push(
        "Finger discomfort was logged in the last 72 hours. Avoid aggravating loading.",
      );
  } else if (checkin.recovery === "very")
    primary = rest(
      "You reported high fatigue. Give yourself a recovery day; the weekly pool can wait.",
    );
  else if (checkin.energy === "low")
    primary = rest("Low energy is a reason to take the pressure off today.");
  else if (
    checkin.fingers === "tired" &&
    candidates.some((t) => trainingTags(t).loading.includes("fingers"))
  ) {
    primary = rest(
      "Your fingers still feel tired. Avoid aggravating finger loading; rest or gentle mobility is a useful session.",
    );
    if (checkin.recovery === "recovered") {
      const independent = sorted.find(
        (t) =>
          safe(t) &&
          !trainingTags(t).loading.includes("fingers") &&
          trainingTags(t).intensity !== "hard",
      );
      alternative = independent
        ? make(
            independent,
            "This uses different loading tags. Keep it comfortable and stop if it aggravates your fingers.",
          )
        : noHangsAlternative();
    }
  } else if (
    checkin.skin === "poor" &&
    candidates.some((t) => trainingTags(t).loading.includes("fingers"))
  ) {
    primary = rest(
      "Your skin needs a break from holds or grip loading. A recovery day leaves room to heal.",
    );
    alternative =
      checkin.recovery === "recovered" ? noHangsAlternative() : null;
  } else if (checkin.recovery === "somewhat") {
    primary = easy
      ? make(
          easy,
          "Some fatigue remains. Its easy intensity tag fits today; keep the movement genuinely easy and stop if it feels harder than expected.",
        )
      : rest(
          "Some fatigue remains and no suitable easy workout is left in your pool. Rest or comfortable mobility fits today.",
        );
    if (easy)
      alternative = rest(
        "More recovery is equally reasonable while you still feel fatigued.",
      );
  } else {
    const ready = sorted.filter(safe);
    const preferred = ready.find((t) => trainingTags(t).intensity !== "easy");
    if (preferred) {
      const tags = trainingTags(preferred),
        window = windowFor(preferred);
      const remaining =
        (goals[preferred.category] ?? 0) - (counts[preferred.category] ?? 0);
      primary = make(
        preferred,
        `You feel recovered. ${window.elapsed === null ? "No earlier significant load is logged for these loading tags." : `${Math.floor(window.elapsed)} hours have passed since significant loading of the same areas (about ${window.required} hours of recovery suggested).`} ${remaining} ${labels[preferred.category] ?? preferred.category} session${remaining === 1 ? " remains" : "s remain"} this week. Its ${tags.intensity} intensity${tags.loading.length ? ` and ${tags.loading.map((t) => loadLabels[t].toLowerCase()).join(", ")} tags` : " tag"} fit today's check-in.`,
      );
      const other = ready.find(
        (t) =>
          t.id !== preferred.id &&
          t.category !== preferred.category &&
          rank[trainingTags(t).intensity] < rank[tags.intensity],
      );
      alternative = other
        ? make(
            other,
            "A lower-intensity session from your remaining pool is also reasonable. Let your recovery lead.",
          )
        : rest("You can always give yourself another recovery day.");
    } else if (
      candidates.length &&
      sorted.some((t) => !safe(t) && trainingTags(t).intensity !== "easy")
    ) {
      const blocked = sorted.find((t) => !safe(t))!,
        window = windowFor(blocked);
      const reason =
        checkin.skin === "worn"
          ? "Worn skin makes a break from grip loading sensible."
          : `Your last significant load${window.last ? ` (${window.last.name})` : ""} was ${Math.floor(window.elapsed ?? hours ?? 0)} hours ago. Allow about ${window.required} hours before another demanding session using the same areas.`;
      primary =
        easy && (window.elapsed ?? 0) >= 24
          ? make(
              easy,
              `${reason} This workout is tagged easy; keep it that way.`,
            )
          : rest(reason);
      alternative =
        primary.intensity === "rest"
          ? noHangsAlternative()
          : rest("A full recovery day is useful until you feel ready.");
    } else if (easy) {
      primary = make(
        easy,
        "An easy movement session is still in your pool. Keep it enjoyable and comfortably low intensity.",
      );
      alternative = rest(
        "Choose recovery if easy movement does not feel restorative.",
      );
    } else
      primary = rest(
        candidates.length
          ? "No remaining workout fits your check-in and recovery window. Rest is useful; avoid cramming sessions."
          : state.templates.every((t) => t.category === "rest")
            ? "Add workout types and sessions in Settings & library to build this profile's training pool. Your daily check-in will use their intensity and loading tags automatically."
            : restTemplate &&
                restTemplate.category !== "rest" &&
                remain(restTemplate)
              ? "A recovery workout remains in your pool. Its rest intensity and absence of loading tags fit a recovery day."
              : "Your weekly session pool is complete. Take some recovery; there is no need to add more hard sessions.",
      );
  }
  if (intense.length >= 2)
    warnings.push(
      "Recent load is elevated. The recovery window is at least 72 hours for repeated loading of the same areas.",
    );
  return {
    primary,
    alternative,
    hoursSinceLoad: hours,
    requiredHours,
    lastLoad,
    warnings,
    needsCheckin: !checkin,
  };
}
export function planWarnings(
  state: State,
  date: string,
  templateId: string,
  excludeId?: string,
  exercises?: Exercise[],
): string[] {
  const original = state.templates.find((t) => t.id === templateId);
  if (!original) return [];
  const template = selectedTemplate(original, exercises);
  const tags = trainingTags(template);
  const high = (t: SessionTemplate) =>
    trainingTags(t).intensity === "hard" ||
    t.exercises.some((e) => e.fingerLoad);
  const warnings: string[] = [];
  const dayPlans = state.plans.filter(
    (p) => p.date === date && p.id !== excludeId,
  );
  const dayLogs = state.logs.filter(
    (l) => dayKey(new Date(l.timestamp)) === date,
  );
  if (dayPlans.length + dayLogs.length >= 1)
    warnings.push(
      "Two sessions today (or more): keep the combined load manageable.",
    );
  if (high(template)) {
    const target = new Date(`${date}T12:00:00`).getTime();
    if (
      state.plans.some((p) => {
        const original = state.templates.find((t) => t.id === p.templateId);
        const t = original
          ? selectedTemplate(original, p.exercises)
          : undefined;
        return (
          p.id !== excludeId &&
          t &&
          high(t) &&
          overlaps(tags.loading, trainingTags(t).loading) &&
          Math.abs(new Date(`${p.date}T12:00:00`).getTime() - target) <
            state.settings.recoveryHours * 3600000
        );
      }) ||
      state.logs.some(
        (l) =>
          significantLoad(l) &&
          overlaps(tags.loading, trainingTags(l).loading) &&
          Math.abs(Date.parse(l.timestamp) - target) <
            state.settings.recoveryHours * 3600000,
      )
    )
      warnings.push(
        `This places demanding sessions using the same loading tags within ${state.settings.recoveryHours} hours. Planned times are approximate; check recovery before training.`,
      );
  }
  const start = weekStart(date, state.settings.weekStart);
  const covered =
    (weekCounts(state.logs, start)[template.category] ?? 0) +
    state.plans.filter(
      (p) =>
        p.id !== excludeId &&
        inWeek(p.date, start) &&
        (() => {
          const t = state.templates.find((t) => t.id === p.templateId);
          return t ? selectedTemplate(t, p.exercises).category : undefined;
        })() === template.category,
    ).length;
  if (
    template.category !== "rest" &&
    covered >=
      (state.weeks[start]?.goals[template.category] ??
        state.settings.goals[template.category] ??
        0)
  )
    warnings.push(
      "This workout type's weekly goal is already covered. Avoid cramming extra hard sessions.",
    );
  return warnings;
}
