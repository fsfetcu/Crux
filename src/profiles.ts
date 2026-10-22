import {
  dayKey,
  emptyProfileState,
  ensureWeek,
  initialState,
  uid,
} from "./model";
import type { State } from "./model";
import { parseBackup } from "./storage";
import { initialCatalogue, parseCatalogue } from "./catalogue";
import type { CatalogueItem } from "./catalogue";
export interface TrainingProfile {
  id: string;
  name: string;
  state: State;
}
export interface ProfileData {
  version: 2;
  activeProfileId: string;
  profiles: TrainingProfile[];
  catalogue?: CatalogueItem[];
}
export const PROFILE_KEY = "crux-planner-profiles-v2";
export function firstProfile(state: State): ProfileData {
  const profile = {
    id: "original-climbing",
    name: `Climbing · ${new Date(state.settings.periodStart + "T12:00:00").toLocaleDateString("en-GB", { month: "short", year: "numeric" })}–${new Date(state.settings.periodEnd + "T12:00:00").toLocaleDateString("en-GB", { month: "short", year: "numeric" })}`,
    state,
  };
  return { version: 2, activeProfileId: profile.id, profiles: [profile], catalogue: initialCatalogue([profile]) };
}
export function parseProfileBackup(raw: string): ProfileData {
  if (raw.length > 10000000) throw Error("Backup exceeds 10 MB.");
  const data = JSON.parse(raw);
  if (data?.version === 1) return firstProfile(parseBackup(raw));
  if (
    data?.version !== 2 ||
    !Array.isArray(data.profiles) ||
    !data.profiles.length ||
    data.profiles.length > 50 ||
    typeof data.activeProfileId !== "string"
  )
    throw Error(
      "This is not a valid Crux profiles backup. Your data has not changed.",
    );
  const profiles = data.profiles.map((p: unknown): TrainingProfile => {
    if (
      !p ||
      typeof p !== "object" ||
      !("id" in p) ||
      !("name" in p) ||
      !("state" in p) ||
      typeof p.id !== "string" ||
      !p.id ||
      p.id.length > 200 ||
      typeof p.name !== "string" ||
      !p.name.trim() ||
      p.name.length > 120
    )
      throw Error("A profile is invalid. Your data has not changed.");
    return {
      id: p.id,
      name: p.name,
      state: parseBackup(JSON.stringify(p.state)),
    };
  });
  if (
    new Set(profiles.map((p: TrainingProfile) => p.id)).size !==
      profiles.length ||
    !profiles.some((p: TrainingProfile) => p.id === data.activeProfileId)
  )
    throw Error("Profile IDs are invalid. Your data has not changed.");
  return { version: 2, activeProfileId: data.activeProfileId, profiles, catalogue: data.catalogue === undefined ? initialCatalogue(profiles) : parseCatalogue(data.catalogue) };
}
export function loadProfiles(): { data: ProfileData; error: string } {
  try {
    // The original v1 document stays untouched as a migration recovery copy.
    const raw =
      localStorage.getItem(PROFILE_KEY) ??
      localStorage.getItem("crux-planner-v1");
    return {
      data: raw ? parseProfileBackup(raw) : firstProfile(initialState()),
      error: "",
    };
  } catch {
    return {
      data: firstProfile(initialState()),
      error:
        "Saved data could not be read. Your existing data has been kept. Export the recovery file before saving new changes.",
    };
  }
}
export function saveProfiles(data: ProfileData) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
}
export function originalProfileBackup() {
  return (
    localStorage.getItem(PROFILE_KEY) ??
    localStorage.getItem("crux-planner-v1") ??
    ""
  );
}
export function createProfile(
  data: ProfileData,
  name: string,
  copyLibrary = false,
  now = new Date(),
): ProfileData {
  if (!name.trim() || name.trim().length > 120)
    throw Error("Give your profile a name (up to 120 characters).");
  if (data.profiles.length >= 50)
    throw Error("This backup supports up to 50 profiles.");
  const current = data.profiles.find((p) => p.id === data.activeProfileId)!;
  const state = copyLibrary
    ? {
        ...structuredClone(current.state),
        logs: [],
        plans: [],
        weeks: {},
        checkins: {},
      }
    : emptyProfileState(now);
  const profile = {
    id: uid(),
    name: name.trim(),
    state: ensureWeek(state, dayKey(now)),
  };
  return {
    ...data,
    activeProfileId: profile.id,
    profiles: [...data.profiles, profile],
  };
}
export function replaceProfileState(
  data: ProfileData,
  id: string,
  state: State,
): ProfileData {
  if (!data.profiles.some((p) => p.id === id))
    throw Error("This profile is no longer available.");
  return {
    ...data,
    profiles: data.profiles.map((p) =>
      p.id === id ? { ...p, state: ensureWeek(state) } : p,
    ),
  };
}
