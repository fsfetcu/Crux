# Apple Calendar setup

The frontend runs on GitHub Pages. Updating private subscriptions are served by the existing Supabase project; personal calendar files are never committed to GitHub. File download works independently of the server.

1. Apply `supabase/migrations/202610220003_calendar_subscriptions.sql` after the two account migrations, then apply `supabase/migrations/202610220004_calendar_weights.sql` for optional planned kilogram loads. Run `supabase/verify-calendar.sql` as postgres; it rolls back every fictional record.
2. Deploy `supabase/functions/calendar-feed/index.ts`, with its shared module, using the Supabase CLI: `supabase functions deploy calendar-feed --no-verify-jwt`. The setting is also recorded in `supabase/config.toml`. This endpoint authenticates its own scoped calendar tokens because Apple Calendar cannot send the app's Google/Supabase session. This does not change authentication on any account endpoint.
3. Alternatively, run `node scripts/prepare-calendar-function.mjs /absolute/scratch/calendar-feed.ts`, paste that generated source into the Supabase function browser editor, name it `calendar-feed` and deploy. In that function's Settings, switch off **Verify JWT with legacy secret** and save. The custom token check remains mandatory in the function and database RPC.
4. The function uses Supabase's built-in `SUPABASE_URL` and legacy `SUPABASE_ANON_KEY` environment variables. No service-role key, new secret or frontend environment variable is needed. Never put a service-role key in GitHub Pages.
5. With a signed-in approved account, wait for Saved online, open Apple Calendar in Crux, create the private link and subscribe on iPhone. The URL is HTTPS with a 256-bit token; the Add button uses `webcal:`. A manual HTTPS link can be pasted into Apple's subscription dialog.

## Data and security

- Authenticated RPCs let an approved account inspect status, enable/replace a link for one of its saved profiles, or disable its own link. Profile IDs are not global authorization boundaries: every management operation also checks the signed-in account.
- Only a SHA-256 hash of a token is stored. The raw token is held in the open dialog until it closes, never in the planner document, browser persistent storage or JSON backup. There is one active link per account/profile.
- `read_calendar_feed` is a security-definer RPC with a fixed empty search path, explicit grants and full token validation. It also rechecks the owner's approved, confirmed Google identity. Revocation of Crux access stops calendar reads as well.
- The RPC projects only planned session IDs/dates, profile name, workout name/location and exercise name/sets/reps/rest and optional planned kilograms. The private subscription table has forced RLS and no direct API grants. No logs, check-ins, notes, projects, email addresses or unrelated profiles are returned.
- The edge handler returns `text/calendar` with no-store, no-referrer, nosniff and noindex headers. It doesn't log or echo tokens. Hosting/service access logs may contain request metadata; treat subscription URLs like passwords. Missing, unknown or disabled tokens get 404, temporary backend failures get 503 rather than an empty calendar.
- Events have stable IDs within each profile, correct all-day exclusive end dates, UTC revision timestamps, CRLF and UTF-8 line folding/escaping. Dates remain the planned local dates across time zones and daylight-saving transitions. There are no alarms or invitations. Completing/removing a plan removes it from the feed; logs remain in Crux.
- This is not bidirectional iCloud integration. Apple controls refresh timing. Disabling a link prevents future reads but does not delete a calendar client's cached or imported copy.

## Validation

Run `npm test` and `npm run build`. Tests cover calendar serialization/injection, multibyte folding, stable IDs/moves, per-day overrides, multiple sessions, cross-account isolation, scoped projection, token hashing/rotation/revocation, HTTP failures and UI opt-in. The browser workflow checks iPhone-sized widths and downloads a real `.ics` file. Final native iOS subscription/import behavior must be checked on a physical device; desktop viewport emulation cannot confirm the OS handoff or Apple's refresh interval.

Primary references: [Apple iPhone calendar subscriptions](https://support.apple.com/en-lamr/guide/iphone/iph3d1110d4/ios), [Supabase function authorization](https://supabase.com/docs/guides/functions/auth), [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545).
