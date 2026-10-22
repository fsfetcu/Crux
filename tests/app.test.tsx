// @vitest-environment jsdom
import { firstProfile, PROFILE_KEY } from "../src/profiles";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  within,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/App";
import {
  addDays,
  dayKey,
  initialState,
  weekStart,
  emptyProfileState,
  snapshotExercise,
} from "../src/model";
import type { State } from "../src/model";
const stored = (): State =>
  (() => {
    const profiles = JSON.parse(
      localStorage.getItem("crux-planner-profiles-v2")!,
    );
    return profiles.profiles.find(
      (p: { id: string }) => p.id === profiles.activeProfileId,
    ).state;
  })();
beforeEach(() => {
  localStorage.clear();
  window.scrollTo = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("working application flows", () => {
  it("lets a tapped workout bubble open a plan with the chosen specific session", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: "Drag SprayWall into calendar" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      (within(dialog).getByLabelText("Session") as HTMLSelectElement).value,
    ).toBe("spray");
    await user.click(
      within(dialog).getByRole("button", { name: "Add to planner" }),
    );
    expect(stored().plans[0].templateId).toBe("spray");
    expect(stored().logs).toHaveLength(0);
  });

  it("opens a keyboard-accessible navigation drawer and restores focus on Escape", async () => {
    const user = userEvent.setup();
    render(<App />);
    const toggle = screen.getByRole("button", { name: "Open navigation" });
    await user.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector("main")?.hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Close navigation" }),
    );
    await user.keyboard("{Escape}");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector("main")?.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(toggle);
  });
  it("shows offline status without preventing a local workout save", async () => {
    const status = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const user = userEvent.setup();
    render(<App />);
    status.mockReturnValue(false);
    fireEvent(window, new Event("offline"));
    expect(screen.getByText("Offline", { exact: true })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Log session" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Save workout",
      }),
    );
    expect(stored().logs).toHaveLength(1);
    expect(screen.getByText("Offline · saved on this device")).toBeTruthy();
  });

  it("remembers a daily check-in and makes discomfort override training", async () => {
    const user = userEvent.setup();
    const view = render(<App />);
    expect(screen.getByText("Let’s start with you.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Pain / discomfort" }));
    await user.click(
      screen.getByRole("button", { name: "Get my recommendation" }),
    );
    expect(stored().checkins[dayKey()].fingers).toBe("pain");
    expect(screen.getByText(/Finger discomfort takes priority/)).toBeTruthy();
    view.unmount();
    render(<App />);
    expect(screen.getByText(/Finger discomfort takes priority/)).toBeTruthy();
  });
  it("logs a strength session without hangs and persists it across visits", async () => {
    const user = userEvent.setup();
    const view = render(<App />);
    await user.click(screen.getByRole("button", { name: "Log session" }));
    const dialog = screen.getByRole("dialog");
    await user.selectOptions(
      within(dialog).getByLabelText("Session"),
      "strength",
    );
    await user.click(
      within(dialog).getByLabelText("Include finger-loading exercises / hangs"),
    );
    await user.type(
      within(dialog).getByLabelText(/Notes/),
      "Short and easy, no hangs.",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Save workout" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(stored().logs).toHaveLength(1);
    expect(stored().logs[0].fingerLoad).toBe(false);
    expect(stored().logs[0].exercises.some((e) => e.fingerLoad)).toBe(false);
    expect(stored().logs[0].notes).toBe("Short and easy, no hangs.");
    view.unmount();
    render(<App />);
    expect(
      screen.queryByText(
        "since Strength, your last significant finger-loading session.",
      ),
    ).toBeNull();
    expect(stored().logs).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Training history" }));
    expect(screen.getByText("Training log")).toBeTruthy();
    expect(screen.getAllByText("Strength").length).toBeGreaterThan(0);
  });
  it("can correct an existing no-hangs workout to include finger loading", async () => {
    const user = userEvent.setup();
    const s = initialState();
    const template = s.templates.find((t) => t.id === "strength")!;
    s.logs = [
      {
        id: "correction",
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        templateId: "strength",
        category: "strength",
        name: "Strength",
        location: "Gym",
        duration: 45,
        rpe: 6,
        fingers: "fresh",
        fingerLoad: false,
        notes: "",
        projects: [],
        exercises: template.exercises.filter((e) => !e.fingerLoad),
      },
    ];
    localStorage.setItem("crux-planner-v1", JSON.stringify(s));
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Training history" }));
    await user.click(
      screen.getByRole("button", { name: /Strength.*Gym.*RPE 6/ }),
    );
    const dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByLabelText("Include finger-loading exercises / hangs"),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    expect(stored().logs[0].fingerLoad).toBe(true);
    expect(stored().logs[0].exercises.some((e) => e.id === "beast")).toBe(true);
  });
  it("plans two sessions, shows loading warnings, and moves a plan", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Weekly planner" }));
    await user.click(screen.getByRole("button", { name: "Plan session" }));
    let d = screen.getByRole("dialog");
    await user.selectOptions(within(d).getByLabelText("Session"), "kilter");
    await user.click(within(d).getByRole("button", { name: "Add to planner" }));
    expect(stored().plans).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Plan session" }));
    d = screen.getByRole("dialog");
    await user.selectOptions(within(d).getByLabelText("Session"), "strength");
    expect(within(d).getByText(/Two sessions today/)).toBeTruthy();
    expect(within(d).getByText(/within 48 hours/)).toBeTruthy();
    await user.click(within(d).getByRole("button", { name: "Add to planner" }));
    expect(stored().plans).toHaveLength(2);
    await user.click(
      screen.getByRole("button", { name: `Edit Kilter on ${dayKey()}` }),
    );
    d = screen.getByRole("dialog");
    const next = addDays(dayKey(), 3);
    fireEvent.change(within(d).getByLabelText("Day"), {
      target: { value: next },
    });
    await user.click(within(d).getByRole("button", { name: "Save plan" }));
    expect(stored().plans.find((p) => p.templateId === "kilter")?.date).toBe(
      next,
    );
    expect(stored().logs).toHaveLength(0);
  });
  it("completes a planned SprayWall exactly once and counts it as hard", async () => {
    const user = userEvent.setup();
    const s = initialState();
    s.plans = [{ id: "plan", date: dayKey(), templateId: "spray" }];
    localStorage.setItem("crux-planner-v1", JSON.stringify(s));
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: "Complete SprayWall" }),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Save workout",
      }),
    );
    expect(stored().logs).toHaveLength(1);
    expect(stored().logs[0].category).toBe("hard");
    expect(stored().plans).toHaveLength(0);
    expect(
      screen.queryByRole("button", { name: "Complete SprayWall" }),
    ).toBeNull();
  });
  it("edits the Beastmaker rest interval without rewriting a previous workout", async () => {
    const user = userEvent.setup();
    const s = initialState();
    s.logs = [
      {
        id: "old",
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        templateId: "strength",
        category: "strength",
        name: "Strength",
        location: "Gym",
        duration: 50,
        rpe: 7,
        fingers: "fresh",
        fingerLoad: true,
        notes: "",
        projects: [],
        exercises: structuredClone(
          s.templates.find((t) => t.id === "strength")!.exercises,
        ),
      },
    ];
    localStorage.setItem("crux-planner-v1", JSON.stringify(s));
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: "Settings & library" }),
    );
    const summary = screen
      .getByText("Strength", { selector: "strong" })
      .closest("summary")!;
    await user.click(summary);
    const details = summary.closest("details")!;
    const rest = within(details).getByLabelText(
      "Beastmaker 2000 slopers rest interval",
    );
    await user.clear(rest);
    await user.type(rest, "240 s");
    await user.click(
      within(details).getByRole("button", { name: "Save session" }),
    );
    expect(
      stored()
        .templates.find((t) => t.id === "strength")
        ?.exercises.find((e) => e.id === "beast")?.rest,
    ).toBe("240 s");
    expect(stored().logs[0].exercises.find((e) => e.id === "beast")?.rest).toBe(
      "180 s",
    );
  });
  it("previews a backup and restores validated data only after confirmation", async () => {
    const user = userEvent.setup();
    render(<App />);
    const s = initialState();
    s.settings.recoveryHours = 60;
    s.plans = [{ id: "imported", date: dayKey(), templateId: "chill" }];
    const file = new File([JSON.stringify(s)], "backup.json", {
      type: "application/json",
    });
    await user.upload(screen.getByLabelText("Import JSON backup"), file);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(localStorage.getItem("crux-planner-v1")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Restore backup" }));
    expect(stored().settings.recoveryHours).toBe(60);
    expect(stored().plans[0].id).toBe("imported");
  });
  it("retains archived goals on settings changes and includes all four sections", async () => {
    const user = userEvent.setup();
    const s = initialState();
    const previous = addDays(weekStart(dayKey()), -7);
    s.weeks[previous] = {
      start: previous,
      startDay: 1,
      goals: { hard: 1, volume: 1, chill: 1, strength: 1 },
      notes: "Recovery first",
    };
    localStorage.setItem("crux-planner-v1", JSON.stringify(s));
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: "Settings & library" }),
    );
    const hard = screen.getByLabelText("Hard", { selector: "input" });
    await user.clear(hard);
    await user.type(hard, "3");
    await user.click(screen.getByRole("button", { name: "Save preferences" }));
    expect(stored().settings.goals.hard).toBe(3);
    expect(stored().weeks[previous].goals.hard).toBe(1);
    await user.click(screen.getByRole("button", { name: "Training history" }));
    await user.selectOptions(screen.getByLabelText("Review week"), previous);
    expect(screen.getByText("A week in the books")).toBeTruthy();
    expect(
      screen
        .getByPlaceholderText("What would you like to carry into next week?")
        .getAttribute("value"),
    ).toBeNull();
    expect(
      (
        screen.getByPlaceholderText(
          "What would you like to carry into next week?",
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("Recovery first");
  });
});

describe("adding workout types and activities from the calendar shelf", () => {
  it("creates a type, keeps its empty tab after reopening, then adds and plans a tagged workout", async () => {
    const user = userEvent.setup();
    const state = initialState();
    const start = weekStart(dayKey());
    const previous = addDays(start, -7);
    state.weeks[start] = { start, startDay: 1, goals: { ...state.settings.goals, hard: 3 }, notes: "Keep this week's adjustment" };
    state.weeks[previous] = { start: previous, startDay: 1, goals: { ...state.settings.goals, volume: 2 }, notes: "Archived week" };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(firstProfile(state)));
    let view = render(<App />);
    await user.click(screen.getByRole('button', { name: 'Add workout type' }));
    let dialog = screen.getByRole('dialog', { name: 'Add a workout type' });
    await user.type(within(dialog).getByLabelText('New workout type'), 'Cycling');
    await user.clear(within(dialog).getByLabelText('Weekly target'));
    await user.type(within(dialog).getByLabelText('Weekly target'), '2');
    await user.click(within(dialog).getByRole('button', { name: 'Create type' }));
    const type = stored().types!.find(t => t.name === 'Cycling')!;
    expect(screen.getByRole('tab', { name: 'Cycling' }).getAttribute('aria-selected')).toBe('true');
    expect(stored().settings.goals[type.id]).toBe(2);
    expect(stored().weeks[start].goals).toEqual({ ...state.weeks[start].goals, [type.id]: 2 });
    expect(stored().weeks[previous]).toEqual(state.weeks[previous]);
    view.unmount();
    view = render(<App />);
    await user.click(screen.getByRole('tab', { name: 'Cycling' }));
    expect(screen.getByText(/Add your first Cycling workout/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Add workout to Cycling' }));
    dialog = screen.getByRole('dialog', { name: 'Add a workout' });
    expect((within(dialog).getByLabelText('Workout type') as HTMLSelectElement).value).toBe(type.id);
    await user.type(within(dialog).getByLabelText('Session name'), 'Hill ride');
    await user.selectOptions(within(dialog).getByLabelText('Intensity'), 'hard');
    await user.click(within(dialog).getByLabelText('Lower body'));
    await user.click(within(dialog).getByLabelText('Cardio'));
    await user.click(within(dialog).getByRole('button', { name: 'Save session' }));
    const workout = stored().templates.find(t => t.name === 'Hill ride')!;
    expect(workout).toMatchObject({ category: type.id, intensity: 'hard', loading: ['lower', 'cardio'] });
    await user.click(screen.getByRole('button', { name: 'Drag Hill ride into calendar' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add to planner' }));
    expect(stored().plans.some(p => p.templateId === workout.id)).toBe(true);
    expect(stored().logs).toHaveLength(0);
    view.unmount(); render(<App />);
    await user.click(screen.getByRole('tab', { name: 'Cycling' }));
    expect(screen.getByRole('button', { name: 'Drag Hill ride into calendar' })).toBeTruthy();
    expect(stored().plans.some(p => p.templateId === workout.id)).toBe(true);
  });
  it("adds a climbing activity to an existing type from the weekly planner", async () => {
    const user = userEvent.setup(); render(<App />);
    await user.click(screen.getByRole('button', { name: 'Weekly planner' }));
    await user.click(screen.getByRole('button', { name: 'Add workout to Hard' }));
    const dialog = screen.getByRole('dialog');
    expect((within(dialog).getByLabelText('Workout type') as HTMLSelectElement).value).toBe('hard');
    expect((within(dialog).getByLabelText('Intensity') as HTMLSelectElement).value).toBe('hard');
    expect((within(dialog).getByLabelText('Fingers / grip') as HTMLInputElement).checked).toBe(true);
    await user.type(within(dialog).getByLabelText('Session name'), 'MoonBoard');
    await user.click(within(dialog).getByRole('button', { name: 'Save session' }));
    expect(screen.getByRole('button', { name: 'Drag MoonBoard into calendar' })).toBeTruthy();
    const before = stored();
    await user.click(screen.getByRole('button', { name: 'Add workout type' }));
    await user.type(screen.getByLabelText('New workout type'), 'Not saved');
    await user.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(stored()).toEqual(before);
  });
  it("rejects duplicate type names without changing the planner", async () => {
    const user = userEvent.setup(); render(<App />);
    const before = stored();
    await user.click(screen.getByRole('button', { name: 'Add workout type' }));
    await user.type(screen.getByLabelText('New workout type'), ' VOLUME ');
    await user.click(screen.getByRole('button', { name: 'Create type' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('already exists'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(stored()).toEqual(before);
    await user.clear(screen.getByLabelText('New workout type'));
    await user.type(screen.getByLabelText('New workout type'), 'Rest & mobility');
    await user.click(screen.getByRole('button', { name: 'Create type' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('already exists'));
    expect(stored()).toEqual(before);
  });
});

describe("profile and custom workout UI", () => {
  it("creates a profile, type and tagged workout, logs it and retains both profiles after reopening", async () => {
    const user = userEvent.setup();
    let view = render(<App />);
    await user.click(
      screen.getByRole("button", { name: "Manage training profiles" }),
    );
    await user.click(screen.getByRole("button", { name: "New profile" }));
    await user.type(screen.getByLabelText("New profile name"), "Running plan");
    await user.click(screen.getByRole("button", { name: "Create profile" }));
    expect(stored().types).toEqual([]);
    expect(stored().logs).toHaveLength(0);
    await user.click(
      screen.getByRole("button", { name: "Settings & library" }),
    );
    await user.click(screen.getByRole("button", { name: "Add workout type" }));
    await user.type(screen.getByLabelText("New workout type"), "Running");
    await user.click(screen.getByRole("button", { name: "Create type" }));
    await user.click(screen.getByRole("button", { name: "Add workout" }));
    let dialog = screen.getByRole("dialog");
    await user.type(
      within(dialog).getByLabelText("Session name"),
      "Hill intervals",
    );
    await user.selectOptions(
      within(dialog).getByLabelText("Intensity"),
      "hard",
    );
    await user.click(within(dialog).getByLabelText("Lower body"));
    await user.click(within(dialog).getByLabelText("Cardio"));
    await user.click(
      within(dialog).getByRole("button", { name: "Save session" }),
    );
    await user.click(screen.getByRole("button", { name: "Dashboard" }));
    expect(
      screen.queryByRole("button", { name: "Pain / discomfort" }),
    ).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Get my recommendation" }),
    );
    expect(
      screen.getByRole("heading", { name: "Hill intervals" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Log this session" }));
    dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Save workout" }),
    );
    expect(stored().logs[0].intensity).toBe("hard");
    expect(stored().logs[0].loading).toEqual(["lower", "cardio"]);
    await user.selectOptions(
      screen.getByLabelText("Training profile"),
      "original-climbing",
    );
    expect(stored().logs).toHaveLength(0);
    expect(
      screen.getByRole("button", { name: "Drag Kilter into calendar" }),
    ).toBeTruthy();
    const data = JSON.parse(localStorage.getItem("crux-planner-profiles-v2")!);
    const runningId = data.profiles.find(
      (p: { name: string }) => p.name === "Running plan",
    ).id;
    await user.selectOptions(
      screen.getByLabelText("Training profile"),
      runningId,
    );
    expect(stored().logs[0].name).toBe("Hill intervals");
    view.unmount();
    view = render(<App />);
    expect(stored().logs).toHaveLength(1);
    expect(
      screen.getByText("Running plan", {
        selector: ".active-profile-pill span",
      }),
    ).toBeTruthy();
  });
  it("copies a library with no history while recovery still sees the original profile's recent session", async () => {
    const user = userEvent.setup();
    const original = initialState();
    const t = original.templates[0];
    original.logs = [
      {
        ...t,
        id: "recent-hard",
        timestamp: new Date(Date.now() - 12 * 3600000).toISOString(),
        templateId: t.id,
        duration: 60,
        rpe: 8,
        fingers: "fresh",
        notes: "",
        fingerLoad: true,
        projects: [],
        exercises: [],
      },
    ];
    localStorage.setItem("crux-planner-v1", JSON.stringify(original));
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: "Manage training profiles" }),
    );
    await user.click(screen.getByRole("button", { name: "New profile" }));
    await user.type(screen.getByLabelText("New profile name"), "Next season");
    await user.click(
      screen.getByLabelText("Copy current workout library and goals"),
    );
    await user.click(screen.getByRole("button", { name: "Create profile" }));
    expect(stored().templates).toHaveLength(7);
    expect(stored().logs).toHaveLength(0);
    await user.click(
      screen.getByRole("button", { name: "Get my recommendation" }),
    );
    expect(screen.getByText("Give yourself some space.")).toBeTruthy();
    expect(
      screen.getByText(/Your last significant load \(Kilter\)/),
    ).toBeTruthy();
  });
});

it("prefills a blank profile's recovery log with minimal effort and no loading", async () => {
  localStorage.setItem(
    PROFILE_KEY,
    JSON.stringify(firstProfile(emptyProfileState())),
  );
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("button", { name: "Log session" }));
  expect(
    (within(screen.getByRole("dialog")).getByRole("slider") as HTMLInputElement)
      .value,
  ).toBe("1");
  await user.click(screen.getByRole("button", { name: "Save workout" }));
  expect(stored().logs[0].intensity).toBe("rest");
  expect(stored().logs[0].loading).toEqual([]);
  expect(stored().logs[0].rpe).toBe(1);
});

describe("actual exercises in calendar categories", () => {
  it("saves day-specific exercise values across reopening and completion without changing another day or the library", async () => {
    const user = userEvent.setup();
    const state = initialState();
    const strength = state.templates.find((t) => t.id === "strength")!;
    const bench = strength.exercises.find((ex) => ex.id === "bench")!;
    const tomorrow = addDays(dayKey(), 1);
    state.plans = [
      {
        id: "today-bench",
        date: dayKey(),
        templateId: strength.id,
        exercises: [snapshotExercise(bench, strength)],
      },
      {
        id: "tomorrow-bench",
        date: tomorrow,
        templateId: strength.id,
        exercises: [snapshotExercise(bench, strength)],
      },
    ];
    localStorage.setItem("crux-planner-v1", JSON.stringify(state));
    const view = render(<App />);
    await user.click(
      screen.getByRole("button", { name: `Edit Bench press on ${dayKey()}` }),
    );
    for (const [field, value] of Object.entries({
      sets: "5",
      reps: "6",
      rest: "150 s",
    })) {
      fireEvent.change(
        screen.getByLabelText(`Bench press ${field} for this day`),
        { target: { value } },
      );
    }
    await user.click(screen.getByRole("button", { name: "Save plan" }));
    expect(stored().plans[0].exercises?.[0]).toMatchObject({
      sets: "5",
      reps: "6",
      rest: "150 s",
    });
    expect(stored().plans[1]).toEqual(state.plans[1]);
    expect(stored().templates).toEqual(state.templates);
    expect(stored().logs).toEqual(state.logs);
    view.unmount();
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: `Edit Bench press on ${dayKey()}` }),
    );
    expect(
      (
        screen.getByLabelText(
          "Bench press rest for this day",
        ) as HTMLInputElement
      ).value,
    ).toBe("150 s");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(
      within(
        document.querySelector('[data-plan-id="today-bench"]') as HTMLElement,
      ).getByRole("button", { name: "Complete Bench press" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/150 s rest/)).toBeTruthy();
    await user.click(
      within(dialog).getByRole("button", { name: "Save workout" }),
    );
    expect(stored().logs[0].exercises[0]).toMatchObject({
      id: "bench",
      sets: "5",
      reps: "6",
      rest: "150 s",
    });
    expect(stored().plans).toEqual([state.plans[1]]);
    expect(stored().templates).toEqual(state.templates);
  });

  it("customizes a full routine without dropping exercises, discards cancelled edits, and resets only selected day values", async () => {
    const user = userEvent.setup();
    const state = initialState();
    const strength = state.templates.find((t) => t.id === "strength")!;
    const bench = strength.exercises.find((ex) => ex.id === "bench")!;
    state.plans = [
      { id: "full-strength", date: dayKey(), templateId: "strength" },
    ];
    localStorage.setItem("crux-planner-v1", JSON.stringify(state));
    render(<App />);
    const open = () =>
      user.click(
        screen.getByRole("button", { name: `Edit Strength on ${dayKey()}` }),
      );
    await open();
    fireEvent.change(screen.getByLabelText("Bench press sets for this day"), {
      target: { value: "9" },
    });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(stored().plans[0].exercises).toBeUndefined();
    await open();
    expect(
      (
        screen.getByLabelText(
          "Bench press sets for this day",
        ) as HTMLInputElement
      ).value,
    ).toBe(bench.sets);
    fireEvent.change(screen.getByLabelText("Bench press rest for this day"), {
      target: { value: "3 min" },
    });
    await user.click(screen.getByRole("checkbox", { name: /Stretching/ }));
    await user.click(
      screen.getByRole("button", { name: "Select all exercises" }),
    );
    expect(
      (
        screen.getByLabelText(
          "Bench press rest for this day",
        ) as HTMLInputElement
      ).value,
    ).toBe("3 min");
    await user.click(screen.getByRole("checkbox", { name: /Stretching/ }));
    await user.click(screen.getByRole("button", { name: "Reset day values" }));
    expect(
      (
        screen.getByLabelText(
          "Bench press rest for this day",
        ) as HTMLInputElement
      ).value,
    ).toBe(bench.rest);
    expect(
      (screen.getByRole("checkbox", { name: /Stretching/ }) as HTMLInputElement)
        .checked,
    ).toBe(false);
    await user.click(
      screen.getByRole("button", { name: "Select all exercises" }),
    );
    fireEvent.change(screen.getByLabelText("Bench press reps for this day"), {
      target: { value: "5" },
    });
    await user.click(screen.getByRole("button", { name: "Save plan" }));
    expect(stored().plans[0].exercises).toHaveLength(strength.exercises.length);
    expect(
      stored().plans[0].exercises?.find((e) => e.id === "bench")?.reps,
    ).toBe("5");
    expect(stored().templates).toEqual(state.templates);
  });

  it("shows named activities inside their category and actual strength/stretching exercises", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(
      screen.getByRole("tab", { name: "Hard" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Drag Tension Board into calendar" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Strength" }));
    expect(
      screen.getByRole("button", {
        name: "Drag Bench press from Strength into calendar",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Drag Stretching from Strength into calendar",
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Drag Kilter into calendar" }),
    ).toBeNull();
    await user.click(screen.getByRole("tab", { name: "Chill" }));
    expect(
      screen.getByRole("button", { name: "Drag Revolt Chill into calendar" }),
    ).toBeTruthy();
    expect(stored().plans).toHaveLength(0);
  });
  it("composes two exercises as one session, then logs only those exercises", async () => {
    const user = userEvent.setup();
    const view = render(<App />);
    await user.click(screen.getByRole("button", { name: "Weekly planner" }));
    await user.click(screen.getByRole("tab", { name: "Strength" }));
    await user.click(
      screen.getByRole("button", {
        name: "Drag Bench press from Strength into calendar",
      }),
    );
    let dialog = screen.getByRole("dialog");
    expect(
      (within(dialog).getByLabelText(/Bench press3/) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      (
        within(dialog).getByLabelText(
          /Beastmaker 2000 slopers5/,
        ) as HTMLInputElement
      ).checked,
    ).toBe(false);
    await user.click(
      within(dialog).getByRole("button", { name: "Add to planner" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Drag Isolated one-arm lat pulldown from Strength into calendar",
      }),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Add to planner",
      }),
    );
    expect(stored().plans).toHaveLength(1);
    expect(stored().plans[0].exercises?.map((e) => e.id)).toEqual([
      "bench",
      "lat",
    ]);
    await user.click(screen.getByRole("button", { name: "Complete Strength" }));
    dialog = screen.getByRole("dialog");
    expect(
      within(dialog).queryByLabelText(
        "Include finger-loading exercises / hangs",
      ),
    ).toBeNull();
    expect(
      within(dialog).getByText("Bench press", {
        selector: ".routine-preview span",
      }),
    ).toBeTruthy();
    await user.click(
      within(dialog).getByRole("button", { name: "Save workout" }),
    );
    expect(stored().plans).toHaveLength(0);
    expect(stored().logs).toHaveLength(1);
    expect(stored().logs[0].exercises.map((e) => e.id)).toEqual([
      "bench",
      "lat",
    ]);
    expect(stored().logs[0].fingerLoad).toBe(false);
    expect(stored().logs[0].exerciseOnly).toBe(true);
    view.unmount();
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: /Strength.*Gym.*RPE 5/ }),
    );
    expect(
      within(screen.getByRole("dialog")).queryByLabelText(
        "Include finger-loading exercises / hangs",
      ),
    ).toBeNull();
  });
  it("logs isolated stretching as recovery instead of completing the strength goal", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("tab", { name: "Strength" }));
    await user.click(
      screen.getByRole("button", {
        name: "Drag Stretching from Strength into calendar",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Add to planner" }));
    await user.click(
      screen.getByRole("button", { name: "Complete Stretching" }),
    );
    expect(
      (
        within(screen.getByRole("dialog")).getByRole(
          "slider",
        ) as HTMLInputElement
      ).value,
    ).toBe("1");
    await user.click(screen.getByRole("button", { name: "Save workout" }));
    expect(stored().logs[0].category).toBe("rest");
    expect(stored().logs[0].exercises.map((e) => e.id)).toEqual(["stretch"]);
    expect(stored().logs[0].loading).toEqual([]);
    expect(stored().logs[0].fingerLoad).toBe(false);
  });
  it("records selected hangs and their rest interval as finger loading", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("tab", { name: "Strength" }));
    await user.click(
      screen.getByRole("button", {
        name: "Drag Beastmaker 2000 slopers from Strength into calendar",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Add to planner" }));
    await user.click(
      screen.getByRole("button", { name: "Complete Beastmaker 2000 slopers" }),
    );
    await user.click(screen.getByRole("button", { name: "Save workout" }));
    expect(stored().logs[0].fingerLoad).toBe(true);
    expect(stored().logs[0].exercises).toHaveLength(1);
    expect(stored().logs[0].exercises[0].rest).toBe("180 s");
    await user.click(
      screen.getByRole("button", { name: "Get my recommendation" }),
    );
    expect(
      screen.getByRole("heading", { name: "Give yourself some space." }),
    ).toBeTruthy();
  });
  it("removes an individual exercise without dropping the rest of its session", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("tab", { name: "Strength" }));
    for (const name of ["Bench press", "Isolated one-arm lat pulldown"]) {
      await user.click(
        screen.getByRole("button", {
          name: `Drag ${name} from Strength into calendar`,
        }),
      );
      await user.click(screen.getByRole("button", { name: "Add to planner" }));
    }
    await user.click(
      screen.getByRole("button", {
        name: `Remove Bench press from ${dayKey()}`,
      }),
    );
    expect(stored().plans).toHaveLength(1);
    expect(stored().plans[0].exercises?.map((e) => e.id)).toEqual(["lat"]);
    expect(stored().logs).toHaveLength(0);
  });
});
