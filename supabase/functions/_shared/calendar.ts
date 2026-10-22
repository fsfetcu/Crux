// Shared by the browser export and the private subscription endpoint.
export interface CalendarExercise {
  name: string;
  sets: string;
  reps: string;
  rest: string;
  weightKg?: number;
}
export interface CalendarEvent {
  id: string;
  date: string;
  name: string;
  location: string;
  exercises: CalendarExercise[];
}
export interface CalendarDocument {
  profileId: string;
  name: string;
  updatedAt: string;
  revision: number;
  events: CalendarEvent[];
}
export function calendarText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;").replace(/,/g, "\\,");
}
export function foldCalendarLine(line: string): string {
  const encoder = new TextEncoder();
  let folded = "", length = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (length + bytes > 75) { folded += "\r\n "; length = 1; }
    folded += char;
    length += bytes;
  }
  return folded;
}
function calendarDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error("Invalid calendar date");
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date)
    throw Error("Invalid calendar date");
  return date.replace(/-/g, "");
}
export function renderCalendar(document: CalendarDocument): string {
  const stamp = new Date(document.updatedAt).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Crux//Training planner//EN",
    "CALSCALE:GREGORIAN", `X-WR-CALNAME:${calendarText(`Crux · ${document.name}`)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];
  for (const event of [...document.events].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
    const date = calendarDate(event.date);
    const end = new Date(`${event.date}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    const details = ["Planned in Crux. Make changes in Crux; this calendar is read-only.",
      ...event.exercises.map((e) => `${e.name}${e.sets ? ` · ${e.sets} sets` : ""}${e.reps ? ` · ${e.reps} reps / time` : ""}${typeof e.weightKg === "number" ? ` · ${e.weightKg} kg` : ""}${e.rest ? ` · Rest ${e.rest}` : ""}`)].join("\n");
    lines.push("BEGIN:VEVENT",
      `UID:${encodeURIComponent(document.profileId)}/${encodeURIComponent(event.id)}@calendar.crux`,
      `DTSTAMP:${stamp}`, `LAST-MODIFIED:${stamp}`,
      `SEQUENCE:${Math.max(0, Math.min(2147483647, Math.floor(document.revision)))}`,
      `DTSTART;VALUE=DATE:${date}`, `DTEND;VALUE=DATE:${calendarDate(end.toISOString().slice(0, 10))}`,
      `SUMMARY:${calendarText(event.name)}`, `LOCATION:${calendarText(event.location)}`,
      `DESCRIPTION:${calendarText(details)}`, "CLASS:PRIVATE", "TRANSP:TRANSPARENT", "END:VEVENT");
  }
  return [...lines, "END:VCALENDAR"].map(foldCalendarLine).join("\r\n") + "\r\n";
}

// Calendar clients cannot send a Supabase sign-in session. A random, revocable
// capability token authorizes ONLY the small workout projection in this RPC.
// Neither the URL nor token is logged, redirected or echoed in a response.
export async function handleCalendarFeed(
  request: Request,
  config: { url: string; anonKey: string },
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const headers = {
    "Cache-Control": "private, no-store, max-age=0",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  };
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response("Method not allowed", { status: 405, headers: { ...headers, Allow: "GET, HEAD" } });
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!/^[a-f0-9]{64}$/.test(token))
    return new Response(request.method === "HEAD" ? null : "Calendar unavailable", { status: 404, headers });
  try {
    const result = await fetcher(`${config.url}/rest/v1/rpc/read_calendar_feed`, {
      method: "POST",
      headers: { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_token: token }),
      signal: AbortSignal.timeout(10000),
    });
    if (!result.ok) throw Error("Calendar read failed");
    const document: CalendarDocument | null = await result.json();
    if (!document)
      return new Response(request.method === "HEAD" ? null : "Calendar unavailable", { status: 404, headers });
    const calendar = renderCalendar(document);
    return new Response(request.method === "HEAD" ? null : calendar, { headers: {
      ...headers, "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="crux.ics"',
    } });
  } catch {
    // A temporary backend error must not look like an empty calendar/deletion.
    return new Response(request.method === "HEAD" ? null : "Calendar temporarily unavailable", { status: 503, headers });
  }
}
