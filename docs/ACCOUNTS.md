# Crux accounts and online saving

Crux stays on GitHub Pages. Supabase handles email/password authentication and a private planner document for each account. Device-only mode remains available. Signing in opens the account's own data, never another person's guest data. Importing a device-only planner is an explicit action with the existing backup preview and Restore confirmation.

## Activate a Supabase project

1. Create the Crux project in your Supabase organization. Choose your database password privately. The application does not need that password.
2. Run [`supabase/migrations/202610220001_accounts.sql`](../supabase/migrations/202610220001_accounts.sql) once in the project's SQL Editor. It creates the planner table, enforces row-level security and creates a compare-and-save function. Unauthenticated requests cannot read or write planners. Authenticated requests can only use their own user ID.
3. In **Authentication → URL Configuration**, set Site URL to `https://fsfetcu.github.io/Crux/` and add that exact URL to the redirect allow list. Add a localhost URL separately for development. Keep email confirmations enabled.
4. For public email signups and password recovery, configure **Authentication → Emails → SMTP Settings** with an email delivery provider. Supabase's default mail service only sends to your organization's team addresses and is intended for development. See the [official SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp). A signup confirmation screen alone does not prove delivery to public users works. Do not disable email verification just to bypass that limit.
5. In the project **Connect** panel, copy the project URL and **publishable key**. Add them to GitHub **Settings → Secrets and variables → Actions → Variables** as `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. They are public browser configuration. Never put a database password, `sb_secret_` key, or legacy `service_role` key in frontend configuration.
6. Run the GitHub workflow on `main` after the account feature is merged. The build reads those variables and keeps the correct `/Crux/` paths.

For local development copy `.env.example` to `.env.local`, replace its public values, and run `npm run dev`. Environment files are ignored by Git.

## Saving and recovery

Each account has a separate local offline cache. Changes save locally before the UI reports success, then synchronize online. Sign in online at least once on a device before relying on its offline account copy. Online saving retries on reconnect, focus and every 30 seconds. A fresh device waits to load its account rather than uploading empty defaults after a connection error.

Online revisions prevent an old device from silently overwriting newer work. When both have changed, Crux keeps both copies and asks you to download the local copy and explicitly choose which version to continue with. This does not merge documents. A device recovery copy is kept before resolving the conflict. Account switches abort pending work; the database also checks the explicit account ID against the authenticated token.

Signing out removes a fully synced account cache. Pending offline edits remain in that account's separate cache for the next sign-in, without being shown in device-only mode or to another account. Browser storage is not encrypted storage and can be removed by browser settings. Export JSON backups regularly. Backups contain training profiles and records, never authentication tokens or passwords.

## Validation and current limits

The automated suite includes real Postgres row-security and revision tests using PGlite, cloud-store failure and race tests, and React sign-in, signup-confirmation, password-recovery and account-switching flows. The browser checks use the official Supabase client against a disposable local API with fictional accounts. They verify the UI, persistence and account switching; they do not establish that a live project's authentication email delivery is configured.

On 22 October 2026 the migration was applied to the Crux Supabase project, the production URL and exact redirect allow list were configured, and the public client variables were added to GitHub. Email confirmation remains enabled. The live database passed [`supabase/verify-accounts.sql`](../supabase/verify-accounts.sql): own-account reads and saves, revision conflicts, cross-account read/write denial, ownership-change denial and anonymous read/write denial. This check uses temporary user IDs without credentials inside a transaction and rolls all test data back.

Public signup and password-reset delivery still require custom SMTP. Until then, the default Supabase mail service is limited to organization team addresses. A real user's email-confirmation flow has not yet been verified. No account deletion or social providers are implemented in this first version. An expired session may need an online sign-in before online saving resumes.
