# Crux — your climbing, in balance

Vibe coded with Codex: a personal training app built around recovery, flexibility and steady progress.

[Open Crux](https://fsfetcu.github.io/Crux/) · [Source on GitHub](https://github.com/fsfetcu/Crux)

A complete mobile-first React + TypeScript app for flexible, recovery-based training, with installable PWA support, offline use, custom profiles, draggable exercises and day-specific exercise values. Device-only mode needs no backend. Optional Supabase accounts keep a separate private planner online for each person, with an offline device copy and sign-in across devices. Authentication tokens are kept out of training backups.

## Accounts and online saving

The account feature includes private account workspaces, offline saving and revision-based conflict review. Google sign-in and a private friends-only email access list are available after provider configuration; they avoid the need for a custom email delivery service. The existing email/password setup is also supported. See [account setup and validation](docs/ACCOUNTS.md) for Google setup, migrations and GitHub build variables. Device-only plans are copied into an account only when you choose to restore them.

## Run locally

Use Node.js **24.10 or later** and npm. In this directory:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite (normally http://127.0.0.1:5173). To serve it on your home network for an iPhone preview, use `npm run dev -- --host 0.0.0.0` and open your computer's LAN IP on the phone. PWA installation and service workers require HTTPS, except on localhost.

```sh
npm test       # recommendation, planning, archive, backup and UI flow tests
npm run build # TypeScript validation and optimized production output
npm run preview # serve the production build locally
```

Deploy `dist/` on any static HTTPS host. Routes are internal UI sections, so no server routing configuration is needed. Root hosting works by default. For a project subdirectory, build with `APP_BASE_PATH=/Crux/ npm run build`; asset paths, the manifest and the offline worker all stay within that path. Preview that build with `APP_BASE_PATH=/Crux/ npm run preview` so the server uses the same asset paths.

## GitHub and GitHub Pages

The GitHub copy contains app source and tests, with a fresh repository history. It excludes the former host's project configuration, credentials, dependency folders, generated builds and personal browser backups.

The included GitHub Actions workflow tests and builds every push to `main` and every pull request. Deployment is disabled unless the repository variable `DEPLOY_GITHUB_PAGES` is set to `true`. This lets a private repository store the code without making an app website public.

To publish after deciding on visibility:

1. In the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.
2. In **Settings → Secrets and variables → Actions → Variables**, create `DEPLOY_GITHUB_PAGES` with value `true`.
3. Run **Actions → Test, build and optionally publish Crux → Run workflow** on `main`. Future pushes to `main` will test, build and deploy automatically.
4. Open the deployment URL shown by the workflow. It uses `https://<owner>.github.io/<repository>/`, or the root for a repository named `<owner>.github.io`. The workflow chooses the matching build path automatically.

Personal-account GitHub Pages websites are public, including Pages built from private repositories. GitHub Free requires a public source repository; eligible paid plans can retain a private source repository while serving a public website. Private Pages access requires an eligible enterprise organization. Check [GitHub's Pages visibility documentation](https://docs.github.com/en/enterprise-cloud%40latest/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site) before enabling publication. An unlisted URL or client-side password is not access control.

### Move existing training data

Before switching addresses, use **Settings & library → Export JSON** in the existing app. On the new address, choose **Import JSON**, review the backup and click **Restore**. Profiles, library changes, plans, exercise overrides, check-ins and logs travel in the backup. Browser storage cannot move automatically between the old host and `github.io`. Keep the backup until you have verified the new app. Device-only planners remain specific to the browser. Configured accounts synchronize their own planner across devices after sign-in.

## Everyday use

1. Open **Dashboard** and choose recovery and finger condition. Skin and energy are optional. Tap **Get my recommendation**. The current day's check-in persists.
2. Read the explanation and optional alternative. The recovery window uses actual logged timestamps, including previous-week workouts and strength sessions with hangs.
3. Tap **Log this session** or **Log session**. Date, session and RPE are enough; notes, duration and boulder projects are optional. Choose any session to override a recommendation.
4. In **Weekly planner** or the dashboard, choose a category in the activity library. **Hard** contains Kilter, Tension Board and SprayWall; **Chill** contains Revolt Chill. **Strength** exposes the actual exercises, including bench press, Beastmaker hangs and stretching. Drag an individual activity/exercise onto a day, or tap it for a date picker. Hold briefly to lift on a phone. Multiple activities fit on a day. Exercises from the same routine compose one planned session; duplicates are ignored. Drag a selected exercise's grip to another day to move just that exercise, or use the session grip to move a group. Remove an exercise with its × button or edit the day's selection. **Plan full routine** remains available. The completion checkmark logs only the selected exercise snapshots, with their actual intensity and loading. A small `!` flags close or combined loading; opening the plan shows the explanation.
5. **Swap days** swaps planned sessions only. Completed workouts keep their real training timestamps. Edit an actual workout through Recent activity or Training history if its recorded date is wrong.
6. Use **Carry last week's plans** only when useful. It moves unfinished plans forward seven days without increasing the goal. It never moves completed workouts. Nothing is marked as a failure.
7. In **Training history**, choose a week for its review, record next-week notes, and copy or download Markdown for Apple Notes. Weeks are archived automatically on the next visit or while the app is open at rollover; no background task is needed.
8. In **Settings & library**, edit goals, the season, week start, recovery minimum, session names and routines. The Beastmaker rest interval defaults to **180 seconds**, is fully editable, and is not presented as a personalized prescription. Other strength sets/reps are editable starting values. The requested Beastmaker 5 × 10 seconds and push-ups 3 × 12 are included.

## Training profiles and custom workouts

Tap the profile name in the top bar (or **Manage profiles** in navigation), then **New profile**. Your original October 2026–January 2027 climbing plan is the first profile, with all existing records preserved. Each profile has separate workout types, weekly goals, session library, dates, calendar, check-ins, history and archived reviews. Rename profiles in the manager. Switch with the navigation selector or by selecting a profile in the manager.

New profiles start with recovery only. Optionally copy the current library and settings without copying history, check-ins or plans. In **Settings & library → Workout types**, add groups such as Running, Strength or Mobility and set each weekly target. **Add workout** creates a named session in a type. Multiple workouts in the same type are alternatives sharing its quota. Add and edit exercises for any workout, including sets, reps/time, rest and finger-loading flags. Season dates remain editable in Training preferences.

Set each workout's **Intensity** to Rest / mobility, Easy, Moderate or Hard, and choose its **Loading tags**: Fingers / grip, Upper body, Lower body, Cardio. These tags drive recommendations automatically for all profiles. Hangs always add finger loading; hard work without area tags is conservatively treated as overall loading. The built-in recovery session remains free of training load.

Profiles represent different plans for the same person, not separate user accounts. Recovery considers actual logs across every profile and across week boundaries. Weekly quotas, calendars and reviews count only their own profile. Daily check-ins are saved per profile; finger and skin questions appear when that library contains finger-loading work.

## Recovery rules

Rules live separately in `src/engine.ts` and are covered by recommendation and profile tests.

- Hard intensity, RPE 8+ or included significant finger-loading exercises count as demanding loading. A hard running workout and a hard board session are recognized from tags, without depending on their workout type names.
- The configured minimum starts at 48h and extends to at least 72h after RPE 9+ or repeated demanding loading of the same areas. Hard sessions sharing loading tags wait for that window. Moderate sessions also avoid freshly loaded areas in the first 24 hours.
- Very high fatigue and finger discomfort favor rest. Recent logged finger discomfort remains relevant for 72h. Some fatigue allows a suitable easy session or recovery; low energy favors rest. Finger/skin condition filters grip-loading options.
- When recovered, prioritize a remaining suitable hard workout, then moderate or easy training. Completed quotas never cause extra hard workouts, and weekdays never cause cramming.
- Kilter, Tension and SprayWall still share the original hard quota. Strength hangs contribute to finger recovery. An optional light strength alternative explicitly omits every finger-loading exercise; its prefilled log records that modification. Workouts tagged with direct grip loading are excluded from this modification; omitting hangs cannot turn a climbing workout into recovery.
- The weekly pool is independent of assigned plans. Moving plans never changes actual training timestamps, recovery or completed progress.
- Actual intensity/loading and exercises are saved with each new log. Later library changes do not rewrite that historical stress. Every recommendation explains its reasons and can be overridden manually.

These are training guidelines, not medical diagnoses or rigid injury-prevention guarantees.

## Data and backups

The key `crux-planner-profiles-v2` stores a versioned document containing all training profiles and the active profile ID in localStorage. Existing `crux-planner-v1` data migrates automatically into the original climbing profile; the original document stays untouched as a recovery copy. This is appropriate for a personal text-based history and is synchronous, persistent and usable offline. Device-only browser storage is specific to a browser profile, device **and URL origin**. Signed-in workspaces use separate per-account device caches and a private Supabase document. Private browsing or clearing website data may remove it. Localhost and the published site have separate data.

Export from **Settings → Export JSON** regularly. Export includes every profile. Import accepts both legacy single-plan and multi-profile backups, validates the entire document, previews its profile/session/week counts, and requires an explicit Restore click before replacing all current profiles. Download your current backup first if needed. A failed import does not change anything. Storage failure is surfaced without pretending a change was saved. Corrupt existing data is retained and can be exported for recovery. Device-only sessions stay on the device. When signed in, profiles and training records synchronize to that account in Supabase; database row security restricts access to the matching authenticated user.

Historical weeks snapshot their weekly targets. New settings apply to the current week and future weeks. Changing the week start regroups current calendar totals while retaining original archives and actual workout dates. Tracking-period dates are descriptive and do not lock logging outside the season.

## Install on a phone or desktop

On iPhone, open the HTTPS site in Safari, use **Share → Add to Home Screen**, then open Crux from its icon. On desktop, use the browser's **Install app** option. The manifest, app icons, and production service worker are included. Load once online before using offline; the shell and built assets are cached. System fonts are available when offline. Device-only mode stays local; signed-in accounts synchronize when online.

## Structure

- `src/profiles.ts` / `src/ProfileContext.tsx` — profile isolation, migration, switching and all-profile backups
- `src/WorkoutTypesEditor.tsx` — editable workout groups and targets
- `src/model.ts` — data model, default session library, local dates, weekly snapshots and reports
- `src/engine.ts` — recommendation rules and planning warnings
- `src/planning.ts` — move, swap and carry-over operations (never change logs)
- `src/storage.ts` — persistence, strict backup validation, file downloads
- `src/App.tsx` — four working sections, check-in, calendar, logging and settings
- `public/sw.js` — production offline shell
- `scripts/finalize-pwa.mjs` — versions the offline cache for each changed build
- `src/useAppStatus.ts` — connection and offline-readiness feedback
- `tests/engine.test.ts` — recovery, planner and backup cases
- `tests/app.test.tsx` — actual React UI flows in an isolated DOM

The app intentionally starts with **no invented training history or check-ins**. Populate it by logging actual sessions or importing your own backup.

## Verification

143 automated tests cover recommendations, profiles, logging, day-specific exercise edits, backups, planning, offline behavior, account switching, sync conflicts, Google sign-in and private membership enforcement. The worker tests run at both `/` and `/crux-planner/`, including scoped asset caching, failed updates, sign-in-page rejection and retaining another project's cache. TypeScript and the production build pass.

The GitHub-ready production build was checked in a real browser at `/crux-planner/`. The icon loaded from that path, the manifest referenced that path, and the interface fit a 390-pixel phone viewport without horizontal overflow. Saved a daily check-in and a bench-press plan with 4 × 8 and 2 min rest, closed the tab, stopped the preview server (HTTP 000), and reopened the cached app. Both the check-in and the exact exercise values remained available offline.

Earlier feature checks covered 320, 375, 390, 430 and 1440-pixel layouts, pointer and keyboard dragging, multiple profiles and saving completed workouts offline. Physical iPhone Safari, home-screen installation and an entire OS/browser restart remain untested. GitHub Actions runs the tests and production build before each Pages deployment. The repository is configured to publish the main branch at `https://fsfetcu.github.io/Crux/`.

## Drag-and-drop planning

The workout shelf includes every named session, including all three hard-board alternatives. Dropping from the shelf creates a new plan each time, including repeat drops of the same workout. Existing plans move using their grip. Dropping outside the calendar or pressing Escape cancels the interaction. Space picks up/drops a focused card; arrow keys choose a calendar day. Workouts remain separately editable and completable when several share a day.

Cards have rounded corners, a floating bubble preview, highlighted day targets, and a soft arrival animation. Reduced-motion settings disable the extra motion. Recovery warnings still apply to stacked sessions. Completed training, timestamps and completed-session progress are never modified by dragging.

Implementation uses dnd-kit's mouse, touch and keyboard sensors in `src/PlannerDnD.tsx`, with separate drop operations in `src/planning.ts` and styling in `src/drag-planner.css`. The drag regression tests cover repeated drops, multiple sessions on an occupied day, moving just one plan, stale sources and unchanged training history.

Real browser tests verified pointer-dragging a workout onto an occupied day, moving a single plan while leaving the other sessions in place, dropping outside the calendar to cancel, and retaining all planned sessions after reloading. Phone layout and keyboard dragging were also checked in the browser; physical iPhone touch gestures remain device-unverified.

## Profile update verification

Added tests for lossless legacy migration, independent blank and copied profiles, complete backup round trips, corrupt data preservation, arbitrary workout types, tag-based loading, cross-profile recovery, quota isolation, prior-week recovery, and actual create/type/workout/log/switch/reopen UI flows.

Real browser checks use disposable data on a separate localhost origin, leaving the published training records untouched.

Profile browser checks passed at 320, 375, 390 and 430px, including the profile manager and expanded custom-workout editor. A new header overflow found at 320px was corrected. On desktop, pointer-dragging a custom workout added a third plan without moving the two existing plans or its completed log.

After stopping the preview server and confirming HTTP 000, closed the tab and reopened the app: both profiles, the active selection, daily check-in, custom workout, three plans and original log remained. Saved another recovery workout with the origin unavailable, switched profiles, closed/reopened again, and verified both logs and all plans remained. This verifies cached app operation without its origin, not physical iPhone airplane mode or an OS/browser restart.

## Individual exercise planning

Click a planned activity in the calendar to edit **Sets**, **Reps / time** and **Rest** for each selected exercise. Save plan applies these values only to that occurrence, leaving the library, other days and completed logs unchanged. Completing the plan records the edited values in history. **Reset day values** restores the selected exercises' current library defaults without adding unselected exercises; **Cancel** discards unsaved changes. Day-specific values persist across visits and are included in JSON backups and moves between days.

The previous 97-test suite covered day-edit isolation, cancellation, reset, full-routine customization, moves, backups and completion with the edited values. Real-browser checks verified the editor at 320, 375, 390, 430 and 1440 pixels without horizontal overflow. With the preview server stopped (HTTP 000), closed/reopened the app, edited a saved day and completed its workout offline, then closed/reopened again: the log retained 5 × 6 with 165 s rest, while the other day retained its library defaults. These are browser viewport and unavailable-origin checks; physical iPhone Safari and an OS/browser restart remain untested.

The activity library is grouped by profile workout types. Category headings are selectors; named activities and individual exercises are the draggable cards. Categories with exercise routines show their exercise cards and a separate full-routine option. The same behavior applies to custom profiles and added routines.

Selected exercises retain their sets, reps/time, rest, intensity and loading tags if the library is edited later. Edit an exercise’s **Intensity & loading** details in Settings to customize those tags. Planned exercise snapshots remain usable even if that exercise is later removed from the library. Completing several selected exercises records one session. Only performed exercises contribute load; an omitted Beastmaker exercise does not add finger stress, while selected hangs do. The original standalone Stretching exercise defaults to rest/mobility and does not fill the strength quota. Existing whole-session plans and logged history remain intact.

95 tests cover exercise composition, independent moves, removal, duplicate/stale drops, tap-to-plan, snapshots, backup validation, selected-exercise logging and recovery, as well as all previous planner/profile/offline cases. Real browser pointer tests verified a named activity drop, composing two strength exercises on an occupied day, and splitting out one exercise without replacing the other plans. Phone-width and keyboard exercise dragging checks passed.

With the updated build cached, stopped the preview server (HTTP 000), closed the tab and reopened offline. The Kilter plan, selected bench-press snapshot, completed stretching and lat-pulldown logs remained. Opening the restored bench plan selected only bench press, with its original sets/reps/rest. The restored lat log retained its exact notes and contained no unselected hangs. No physical iPhone Safari test was available.
