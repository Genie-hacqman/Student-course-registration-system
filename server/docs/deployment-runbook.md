# Deployment Runbook (Render + Aiven for MySQL)

This is written for the actual chosen setup: the API on **Render**, the database on **Aiven for
MySQL** — two separate platforms, database decoupled from the app host. See
`docs/backup-verification.md` first; this assumes backups are already confirmed working.

## First deploy

1. **Provision the Aiven for MySQL service** if not already done (see `backup-verification.md` for
   the recommended plan tier). Note its host, port, username, password and database name.
2. **Create the Render Web Service**, pointed at this repository.
   - Build Command: `npm ci`
   - Start Command: `npm start`
   - **Pre-Deploy Command: `npm run db:migrate`** — see below.
3. **Set every environment variable** in Render's Environment tab (Dashboard → your service →
   Environment). Values are grouped exactly as in `.env.example`:

   | Variable | What to set it to |
   |---|---|
   | `NODE_ENV` | Render sets this to `production` automatically for Node.js web services at runtime — you shouldn't need to set it yourself. **Confirm it anyway** (Render Shell: `echo $NODE_ENV`) before relying on it, since every production safety check this app has (SMTP requirement, CORS validation, seed-safety guards) is gated on this exact value, and silently running as `development` would skip all of them without any error. ([Render: default environment variables](https://render.com/docs/environment-variables)) |
   | `PORT` | **Don't set this.** Render assigns it automatically (default `10000`) and this app already reads `process.env.PORT` and binds to all interfaces with no host override — it works with whatever Render assigns. |
   | `CORS_ORIGIN` / `FRONTEND_URL` | Your real frontend's exact `https://` origin. `env.js` refuses to boot with a wildcard, `http://`, or a leftover `localhost` value here — see CLAUDE.md's cross-origin section for why this specific value matters (it's what lets the browser send the refresh cookie at all). |
   | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | From the Aiven service's connection details. |
   | `JWT_ACCESS_SECRET` | A long random string — `openssl rand -hex 48`. Never reuse the placeholder from `.env.example`. |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Your real mail relay. **Required** — the server refuses to boot in production without `SMTP_HOST` and `SMTP_FROM`. |
   | `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | A real email and a strong, unique password (12+ characters, not the published demo default `Admin@12345`) — see step 1's seeding rules. Only needed for the one-time seed below; can be removed from the environment afterward if you prefer. |
   | `LOG_LEVEL`, `SENTRY_DSN` | Optional. Set `SENTRY_DSN` if you have a Sentry project — recommended, not required. |

4. **Deploy once**, then run the one-time production seed. Render's **Shell** tab (or a one-off job)
   against the live service:
   ```bash
   npm run db:seed        # roles, default settings, the one real super admin — NEVER db:seed:demo
   ```
   `npm run db:seed:demo` must never run here — it creates accounts with published, publicly-known
   passwords. It also refuses to run at all when `NODE_ENV=production`, as a backstop, but don't
   rely on that; just don't run it.
5. **Confirm**: hit `<your-api>/api/health` and check `database: "up"` and
   `integrations: { email: true, errorTracking: … }`.

## Loading the institution's real data

Do this once, after the first deploy and `npm run db:seed`, signed in as the super admin (or a
registrar/admin with the matching permissions). Nothing here uses demo data.

1. **Settings**: `PATCH /api/admin/settings` with at least `institution.name` (it appears on
   registration slips and in invite emails). Review `registration.requireApproval`,
   `registration.defaultMaxCredits`, `registration.waitlistEnabled` and `grades.passingGrade` too.
2. **Academic year and semester**: create them with `POST /api/academic-years` and
   `POST /api/semesters`, and mark the running semester `isCurrent: true`. Sections imported without
   a `semesterId` go into the current semester.
3. **Import, in this order.** Each file can only reference records loaded by the ones above it.
   Every endpoint is `POST /api/admin/import/<name>` with a body of `{ "rows": [...], "dryRun": true|false }`
   (up to 5000 rows). Column templates are in [`docs/import-templates/`](import-templates/).

   | # | Endpoint | Key (upserted on) | References | Permission |
   |---|---|---|---|---|
   | 1 | `departments` | `code` | — | `course:manage` |
   | 2 | `programs` | `code` | `departmentCode` | `course:manage` |
   | 3 | `courses` | `code` | `departmentCode` | `course:manage` |
   | 4 | `program-courses` | `programCode` + `courseCode` | both | `course:manage` |
   | 5 | `prerequisites` | the group itself | `courseCode`, `requiresAnyOf` | `course:manage` |
   | 6 | `lecturers` | `email` | `departmentCode` | `user:manage` |
   | 7 | students: `POST /api/admissions/bulk` | `admissionNumber` (or `studentNumber`) | `programCode` | `student:admit` |
   | 8 | `sections` | `courseCode` + semester + `sectionCode` | `lecturerStaffNumber` | `section:manage` |
   | — | historical grades: `POST /api/results/import` | student + course + semester | `studentNumber`, `courseCode` | `grade:manage` |

   - **Always dry-run first** (`"dryRun": true`). It runs every row exactly as the real import would,
     then rolls everything back and returns the same report.
   - The report is `{ created, updated, unchanged, failed, invited, errors: [{ row, key, message }] }`.
     `row` is the 0-based index in `rows`.
   - Each row is its own transaction. A bad row is reported, and the good rows still import.
   - Re-running a corrected file is safe. Existing records are matched on their key and updated, and
     a field left out of a row leaves the stored value unchanged.
   - Students only see courses on their program's curriculum. A course left out of step 4 is
     invisible to them.
   - A prerequisite row is one requirement group. `requiresAnyOf: ["MATH101", "MATH102"]` means
     either course satisfies it. Rows for the same course are all required (AND).
   - A section's `schedules`, when given, replace its whole timetable and are checked for room and
     lecturer clashes.
   - **Students are admitted, not invited.** Before step 7, set `institution.studentEmailDomain`
     (e.g. `school.edu.gh`) in settings; admission refuses to run without it. Each new row gets a
     Student ID, a school email and a temporary PIN, returned **once** in the report's `credentials`.
     Print them on the admission letters straight away: they can't be retrieved later (a lost PIN is
     replaced with `POST /api/students/:id/reset-pin`). Students sign in with Student ID + PIN and
     must change the PIN first. Make sure the school's mail system creates the matching mailboxes,
     since PIN recovery codes go there.
4. **Invite staff.** Imported lecturers have no usable password, so nobody can sign in as them until
   they choose one. Once the data is checked, send the invites:
   `POST /api/admin/import/invites` with `{ "role": "LECTURER" }`.
   - Invites go out in batches (`limit`, default 200). Repeat the call until `remaining` is 0.
   - Each email links to `FRONTEND_URL/reset-password?token=…` and is valid for `INVITE_EXPIRES_HOURS`
     (default 72).
   - Calling it again later re-sends only to people whose invite expired unused.
   - To invite one person, use `POST /api/users/:id/invite`.
   - Alternatively, pass `"sendInvites": true` on the lecturer or student import to email everyone
     in that file as soon as their row commits.
   - SMTP must be configured before this step; production refuses to boot without it anyway.
5. **Staff accounts** (registrars, advisors, admins): `POST /api/users` **without** a `password`.
   The person gets an invite to set their own.

## Every deploy after that

With the Pre-Deploy Command set, a normal deploy already does the right thing:

1. Render builds the new code.
2. **Pre-Deploy Command runs `npm run db:migrate`** against the live database, before the new
   version takes traffic. A migration that fails **cancels the deploy** — the old version keeps
   serving, the broken schema change never goes live. ([Render: pre-deploy command](https://render.com/changelog/predeploy-command))
3. Only if that succeeds does the new instance start and take over traffic.

## Migrations must be backward-compatible with the currently-running code

Render's rollback (below) redeploys old **code**, but does not undo a migration that already ran
against the shared database. If a migration and the code that depends on it ship in the same
deploy, rolling back the code after a bad deploy leaves the database ahead of the code you rolled
back to. Practical rule: prefer additive migrations (new columns/tables) that old code simply
ignores, and avoid renaming or dropping something in the same deploy that also changes the code
using it — split that into two deploys if it's ever needed.

## Rollback

1. Render Dashboard → your service → **Events** / deploy history → find the last known-good deploy
   → **Redeploy**.
2. This reverts the running **code** immediately. It does **not** revert the database. If the bad
   deploy's migration needs undoing, that's a manual decision — check what it changed
   (`migrations/<file>.cjs`'s `down()`) before running anything against production, and prefer fixing
   forward with a new migration over running `db:migrate:undo` against a live database.

## Lost super admin access

If the only super admin account is gone (or was never created because `db:seed` ran earlier without
it), set `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` and run `npm run admin:create` in the Render Shell.
It creates the super admin only when none exists, never promotes an existing account, and applies the
same production password rules as the seeder. Remove the variables afterwards if you prefer.

## Credentials

- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` are only needed for the one-time seed above. Whoever
  holds them should be a specific named person (registrar's office IT contact, etc.), not left as a
  shared secret in a chat log — treat it the same as any other production credential.
- `JWT_ACCESS_SECRET` rotation invalidates every existing session (everyone logged out) — expected
  behavior if it's ever regenerated, not a bug.
