# Crux accounts and online saving

Crux stays on GitHub Pages. Supabase handles Google authentication and a private planner document for each account. The live app requires sign-in before opening a planner. Signing in opens the account's own data, never another person's guest data. Importing an earlier device-only planner is an explicit action with the existing backup preview and Restore confirmation. Local builds without Google mode retain the device-only and email/password flows.

## Google sign-in for a small group

Google sign-in is the preferred setup for friends who already have Google accounts. It does not need a sending domain, custom SMTP or a separate Crux password. Google handles authentication and password recovery; Supabase still stores each person's private planner. Basic identity scopes are `openid`, `email` and `profile`. Crux does not request access to Gmail messages, Drive files or contacts.

The Google feature is activated only when `VITE_GOOGLE_AUTH_ENABLED=true`. Keep this flag off until all backend setup below is complete. When enabled, Crux waits to restore a session, then automatically opens Google's account chooser if the visitor is signed out. The planner is not mounted until a user is signed in. A restored session opens the planner directly, including its cached offline copy. Existing email/password mode remains available in builds without Google mode.

An automatic redirect is attempted once per tab visit. Cancellation, browser Back, failed sign-in and intentional sign-out leave a **Continue with Google** button rather than restarting a loop. A new tab starts the automatic flow normally. Offline signed-out visitors see a connection message; reconnecting starts sign-in if no attempt has been made. When session storage is unavailable, sign-in starts from the button. Existing device-only records are retained for optional restoration after signing in.

1. In a dedicated Google Cloud project, configure Google Auth Platform with Crux as the app name and an External audience. Google requires agreement to its API Services User Data Policy. Use only the three basic identity scopes above.
2. Create a **Web application** OAuth client. Authorized JavaScript origin: `https://fsfetcu.github.io`. Authorized redirect URI: `https://cpnobpujwvodoshkkmaj.supabase.co/auth/v1/callback`. This callback differs from the app's final redirect URL, `https://fsfetcu.github.io/Crux/`.
3. Enter the client ID and secret privately in **Supabase → Authentication → Sign In / Providers → Google**. Keep nonce checks and email verification enabled. Never put the Google client secret into `VITE_` variables, GitHub code, training backups or chat.
4. Apply [`202610220002_google_friends.sql`](../supabase/migrations/202610220002_google_friends.sql) after the first migration. Add the owner's and friends' actual Google email addresses **privately in Supabase**, in `crux_private.approved_users`. This table is outside the exposed API schema, has row security, and is unreadable and uneditable by app users. The public migration contains no actual member addresses. For example, with the placeholder replaced privately:

   ```sql
   insert into crux_private.approved_users(email)
   values (lower('approved-person@example.test'))
   on conflict(email) do update set allowed=true;
   ```

5. In **Authentication → Auth Hooks → Before User Created**, select the Postgres function `public.crux_before_user_created`. It rejects unapproved addresses and new non-Google signups. Database policies separately enforce membership on every read and write, including existing sessions. A matching, verified Google identity is required; editable user metadata cannot grant access. To revoke online access, set a person's `allowed` field to `false`. This retains their planner and cannot erase previously downloaded or offline copies.
6. Keep Google's audience in Testing for the small-group setup. Google exempts basic identity-only sign-in (`openid`, `email`, `profile`) from its test-user-list requirement and seven-day authorization expiry. The Supabase checks enforce the actual friends-only access list. See [Google's audience rules](https://support.google.com/cloud/answer/15549945) for the scope exception. Additional Google data scopes are not configured.
7. Run [`verify-google-accounts.sql`](../supabase/verify-google-accounts.sql) in the SQL Editor as `postgres`. It checks approved and unapproved Google access, account isolation, revisions, signup-hook permissions, private-list protection, access revocation and anonymous denial. Fictional users and planner records are created inside a transaction and rolled back. This validates database enforcement; it does not replace a real Google sign-in check.
8. Add the GitHub Actions repository variable `VITE_GOOGLE_AUTH_ENABLED=true`, then deploy `main`. Test the redirect, first sign-in, account save, sign-out and sign-in again. Each person must consent to Google sign-in for themselves. Existing device-only data is imported only through the explicit backup preview and Restore flow.

The website and source remain public on GitHub Pages. The Google sign-in gate controls the app's entry flow; private online account access is enforced separately on the backend. A denied or revoked account keeps its cached records, but online access is refused and Crux asks the user to use an approved account.

On 22 October 2026, the owner saved the Google OAuth credentials in Supabase, the Google provider was enabled, and the second migration plus a private approved-email list were applied. The Before User Created hook is enabled and calls `public.crux_before_user_created`. Nonce checks and the requirement for an email remain enabled. GitHub's `VITE_GOOGLE_AUTH_ENABLED` variable is now `true`.

The live database passed `verify-google-accounts.sql`: approved-account access, private-list permissions, signup-hook decisions and grants, revision conflicts, account isolation, revocation without deletion, and anonymous denial. All fictional test records were rolled back. Hosted Supabase does not let its SQL Editor `postgres` role switch to `supabase_auth_admin`; the script checks that service role's grants explicitly and tests hook decisions as the database owner. Automated tests separately exercise the hook as the auth role.

The deployed browser flow completed the approved owner's first Google sign-in and returned to Crux with **Saved online**. Closing the app tab and opening it again retained the signed-in account, loaded its initial planner, and returned to **Saved online**. No fictional workouts were added to the real account. The Google sign-in panel fit 320 px and 390 px browser viewports without horizontal overflow. These are browser viewport checks; physical iPhone Safari has not been tested. Returning users may need a second reload after a deployment while the previous offline version updates.

The Crux mountain logo, homepage and public privacy/terms links are saved in Google branding. The matching app pages are `privacy.html` and `terms.html`, linked from the app footer. Branding remains in Testing; a Google verification badge or production branding approval is not claimed.

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

Email/password signup and password-reset delivery require custom SMTP. Until then, the default Supabase mail service is limited to organization team addresses. The Google flow avoids that email delivery dependency once activated. A real user's email-confirmation flow has not yet been verified. Account deletion is not implemented. An expired session may need an online sign-in before online saving resumes.

### Catalogue compatibility

Apply `supabase/migrations/202610220005_preserve_catalogue.sql` after the account migrations. It preserves an existing personal catalogue when an older cached app saves a document without that new root field. New clients send the field explicitly, including an empty array when clearing it. Ownership checks, row security and revision conflict checks remain unchanged. Refresh every device to use the new catalogue, grade-count and kilogram controls.
