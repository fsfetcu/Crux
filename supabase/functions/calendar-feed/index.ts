import { handleCalendarFeed } from "../_shared/calendar.ts";

Deno.serve((request) => handleCalendarFeed(request, {
  url: Deno.env.get("SUPABASE_URL")!,
  anonKey: Deno.env.get("SUPABASE_ANON_KEY")!,
}));
