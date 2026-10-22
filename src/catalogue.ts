import { dayKey, ensureWeek, initialState, labelsFor, selectedTemplate, snapshotExercise, trainingTags, uid, weekStart, workoutTypes } from "./model";
import type { SessionTemplate, State, WorkoutType } from "./model";
import type { TrainingProfile, ProfileData } from "./profiles";
import { tagFields, validExercise } from "./storage";
export const catalogueFocus = ["Projecting", "Max power", "Power endurance", "Endurance", "Technique & easy climbing", "Strength", "Mobility & recovery", "Other"] as const;
export type CatalogueFocus = typeof catalogueFocus[number];
export interface CatalogueItem extends SessionTemplate {
  focus: CatalogueFocus;
  kind: "workout" | "exercise";
  source?: { profileId: string; templateId: string };
}
const focusFor = (t: SessionTemplate): CatalogueFocus => t.category === "hard" ? "Projecting" : t.category === "strength" ? "Strength" : t.category === "rest" ? "Mobility & recovery" : t.category === "volume" ? "Endurance" : "Technique & easy climbing";
export function catalogueFromTemplate(template: SessionTemplate, profile: Pick<TrainingProfile,"id">): CatalogueItem {
  return { ...structuredClone(template), id: `plan:${profile.id}:${template.id}`, exercises: template.exercises.map((e) => snapshotExercise(e,template)), ...trainingTags(template), focus: focusFor(template), kind: "workout", source: {profileId:profile.id,templateId:template.id} };
}
export function initialCatalogue(profiles: TrainingProfile[]): CatalogueItem[] {
  const entries: CatalogueItem[] = profiles.flatMap((p) => p.state.templates.filter((t) => t.category !== "rest").map((t) => ({ ...catalogueFromTemplate(t, p), typeName: labelsFor(p.state)[t.category] })));
  const starter = (id: string, name: string, focus: CatalogueFocus, category: string, description: string, sets: string, reps: string, rest: string, targetRpe?: number): CatalogueItem => ({
    id: `starter:${id}`, name, focus, category, description, location: "", kind: "workout", intensity: ["Projecting","Max power","Power endurance"].includes(focus) ? "hard" : "moderate", loading: ["fingers", "upper"], targetRpe,
    exercises: sets ? [{id:`${id}-block`,name,sets,reps,rest,fingerLoad:false,loading:["fingers","upper"]}] : [],
  });
  entries.push(
    starter("board-projecting", "Board projecting", "Projecting", "hard", "Choose projects on Kilter, Tension Board, a spray wall or another board. Record attempts and progress in your log; rest between quality efforts.", "", "", ""),
    starter("max-power", "Board max power", "Max power", "hard", "Practice a small number of difficult moves with recovery between attempts. Set your own attempt count and rest for the day.", "", "", ""),
    starter("4x4", "Bouldering 4×4", "Power endurance", "volume", "Four rounds of four boulders. Choose difficulty and between-round rest to fit your current ability and recovery.", "4", "4 boulders", "Between rounds; edit as needed"),
    starter("20-boulders", "20-boulder endurance", "Endurance", "volume", "Complete a continuous block of 20 suitably easy boulders. Adjust your target RPE and take breaks or stop when needed.", "1", "20 boulders", "As needed", 5),
    starter("top-rope", "Top-rope endurance", "Endurance", "volume", "Easy continuous top-rope climbing. Set the route count or climbing time, rest and target RPE to suit the day.", "1", "Choose routes / time", "As needed", 5),
  );
  const strength = initialState().templates.find((t) => t.id === "strength")!;
  for (const exercise of strength.exercises) {
    const selected = selectedTemplate(strength, [snapshotExercise(exercise, strength)]);
    entries.push({ ...selected, id: `starter:exercise:${exercise.id}`, kind: "exercise", description: exercise.fingerLoad ? "Finger-loading hangs. Set your own load and rest; these contribute to finger recovery." : "An individual exercise. Edit sets, reps or time, rest and optional kilograms for your training.", focus: exercise.id === "stretch" ? "Mobility & recovery" : "Strength" });
  }
  return entries;
}
export function parseCatalogue(value: unknown): CatalogueItem[] {
  if (!Array.isArray(value) || value.length > 2000) throw Error("Catalogue must contain at most 2,000 items.");
  const text = (v: unknown, max = 20000) => typeof v === "string" && v.length <= max;
  if (!value.every((t) => t && typeof t === "object" && ["id","name","category","location","description"].every((key) => text(t[key])) && t.id && t.name.trim() && catalogueFocus.includes(t.focus) && ["workout","exercise"].includes(t.kind) && tagFields(t) && Array.isArray(t.exercises) && t.exercises.length <= 200 && (t.kind !== "exercise" || t.exercises.length === 1) && t.exercises.every(validExercise) && new Set(t.exercises.map((e: {id:string}) => e.id)).size === t.exercises.length && (t.source === undefined || (t.source && text(t.source.profileId,200) && text(t.source.templateId))))) throw Error("A catalogue item is invalid. Your data has not changed.");
  if (new Set(value.map((t) => t.id)).size !== value.length) throw Error("Catalogue item IDs must be unique.");
  return value as CatalogueItem[];
}
export function templateInPlan(item: CatalogueItem, profile: TrainingProfile): SessionTemplate | undefined {
  return profile.state.templates.find((t) => t.catalogueId === item.id || (item.source?.profileId === profile.id && item.source.templateId === t.id) || (item.source?.templateId === t.id && t.name === item.name && t.category === item.category && t.location === item.location && t.description === item.description && JSON.stringify(t.exercises.map((e) => snapshotExercise(e,t))) === JSON.stringify(item.exercises)));
}
export function addCatalogueToPlan(data: ProfileData, item: CatalogueItem, profileId: string, category: string, newType?: {name:string;target:number}, exerciseIds?: string[]): ProfileData {
  const profile = data.profiles.find((p) => p.id === profileId);
  if (!profile) throw Error("Choose a training plan.");
  if (templateInPlan(item, profile)) throw Error("This item is already in that training plan.");
  let state = ensureWeek(profile.state);
  let types: WorkoutType[] = workoutTypes(state);
  if (newType) {
    const name = newType.name.trim();
    if (!name || name.length > 120 || types.some((t) => t.name.toLowerCase() === name.toLowerCase()) || name.toLowerCase() === "rest & mobility" || types.length >= 100 || !Number.isInteger(newType.target) || newType.target < 0 || newType.target > 14) throw Error("Choose a unique workout type name and a weekly target from 0 to 14.");
    category = uid(); types = [...types, {id:category,name}];
    const start = weekStart(dayKey(), state.settings.weekStart);
    state = {...state,types,settings:{...state.settings,goals:{...state.settings.goals,[category]:newType.target}},weeks:{...state.weeks,[start]:{...state.weeks[start],goals:{...state.weeks[start].goals,[category]:newType.target}}}};
  }
  if (!types.some((t) => t.id === category)) throw Error("Choose a workout type for this plan.");
  const exercises = exerciseIds ? item.exercises.filter((e) => exerciseIds.includes(e.id)) : item.exercises;
  if (exerciseIds && !exercises.length) throw Error("Select at least one exercise.");
  const selected = selectedTemplate(item, exerciseIds ? exercises : undefined);
  const template: SessionTemplate = {...structuredClone(selected),id:uid(),category,catalogueId:item.id,typeName:types.find((t) => t.id === category)!.name};
  state = {...state,templates:[...state.templates,template]};
  return {...data,profiles:data.profiles.map((p) => p.id === profileId ? {...p,state} : p)};
}
export function removeTemplateFromPlan(state: State, id: string): State {
  if (state.templates.find((t) => t.id === id)?.category === "rest") throw Error("Keep the recovery session available.");
  return {...state,types:workoutTypes(state),templates:state.templates.filter((t) => t.id !== id),plans:state.plans.filter((p) => p.templateId !== id)};
}
