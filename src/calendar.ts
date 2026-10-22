import { selectedTemplate } from "./model";
import type { TrainingProfile } from "./profiles";
import type { CalendarDocument } from "../supabase/functions/_shared/calendar";
export { renderCalendar } from "../supabase/functions/_shared/calendar";

export function profileCalendar(profile: TrainingProfile, start?: string, end?: string): CalendarDocument {
  return {
    profileId: profile.id,
    name: profile.name,
    updatedAt: new Date().toISOString(),
    revision: 0,
    events: profile.state.plans.filter((p) => (!start || p.date >= start) && (!end || p.date < end)).flatMap((plan) => {
      const template = profile.state.templates.find((t) => t.id === plan.templateId);
      if (!template) return [];
      const selected = selectedTemplate(template, plan.exercises);
      return [{ id: plan.id, date: plan.date, name: selected.name, location: selected.location,
        exercises: selected.exercises.map(({ name, sets, reps, rest }) => ({ name, sets, reps, rest })) }];
    }),
  };
}
export function newCalendarToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) => n.toString(16).padStart(2, "0")).join("");
}
export function subscriptionURL(supabaseURL: string, token: string): string {
  const url = new URL("functions/v1/calendar-feed/crux.ics", `${supabaseURL.replace(/\/$/, "")}/`);
  if (url.protocol !== "https:" || !/^[a-f0-9]{64}$/.test(token)) throw Error("Invalid calendar link");
  url.searchParams.set("token", token);
  return url.href;
}
