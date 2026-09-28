# SCRS Backend — Student Course Registration System

Express 5 + Sequelize (MySQL) + Socket.IO API for real-time university course registration.
It covers courses, prerequisites, academic periods, sections and schedules, registration with a rules engine, timetables, waitlists and notifications.

**Deploying for real?** See [`docs/deployment-runbook.md`](docs/deployment-runbook.md) (Render + Aiven for MySQL) and [`docs/backup-verification.md`](docs/backup-verification.md) first.

## Setup

```bash
cp .env.example .env         # fill in DB_* and JWT_ACCESS_SECRET (>= 32 chars)
npm install
npm run db:create
npm run db:migrate
npm run db:seed              # roles, default settings, one real super admin — safe for production
npm run db:seed:demo         # dev/staging only: fake departments, courses, students — see warning below
npm run dev                  # http://localhost:5000/api/health
```

**`npm run db:seed` is the only seed command that is safe to run against a real database.** It creates
the six roles, the default settings, and one super admin from `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`
— nothing else.

### Where the logins and the school domain live

- **Super admin:** the `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` in your `.env`. Sign in on the **Staff** tab.
  **No accounts, or locked out?** Run `npm run admin:create`: it creates that super admin if the database
  has none and changes nothing otherwise (use it when `db:seed` has already run and would fail on the roles).
- **Other staff:** created by the super admin under **Users** (leave the password empty to email an invite).
- **Students:** no fixed logins. **Students → Admit student** (or bulk admission on **Import data**) shows
  each student's ID, school email and temporary PIN **once**; after that only **Reset PIN** gives a new one.
- **School email domain:** **Settings → System settings → Student email domain** (the
  `institution.studentEmailDomain` setting). Admission refuses to run until it's set.

**`npm run db:seed:demo` must never be run against production.** It creates fake students, lecturers
and a registrar with the published passwords below. Every demo seeder refuses to run at all when
`NODE_ENV=production`, as a hard backstop — but don't rely on that; just don't run this command
against a real deployment.

Demo accounts created by `db:seed:demo` (dev/staging only — these passwords are public):

| Email | Password | Role |
|---|---|---|
| admin@scrs.local | Admin@12345 | SUPER_ADMIN (only if you ran `db:seed` without setting `SEED_ADMIN_*` first) |
| registrar@scrs.local | Registrar@12345 | REGISTRAR |
| lecturer@scrs.local | Lecturer@12345 | LECTURER |
| student@scrs.local (or Student ID `STU2025001`) | Student@12345 | USER (student, level 200, passed CS101 and MATH101) |

The demo "Current Semester" has its registration window open relative to the time you seed. CS203 and CS204 deliberately clash on Wednesday.

## CI

`.github/workflows/ci.yml` runs the full test suite on every push and pull request: a MySQL 8 service container, `npm ci`, then `npm test`. There is no separate lint or build step.

## Tests

```bash
npm test          # unit + integration; uses database <DB_NAME>_test, which is DROPPED and recreated
npm run test:unit # pure rule tests, no database needed
```

### Load testing (before every real registration period)
`scripts/load-test-registration.mjs` simulates registration day: hundreds of students hitting the same handful of popular sections in one burst, and checks that never more than `capacity` succeed per section, with no 500s or hangs. It reports latency percentiles and throughput so a real bottleneck shows up before it happens live, not during it.

**Run it against a disposable database only — it creates real accounts and registrations, and relies on the demo seed data.** Start the server with `NODE_ENV=test` so the auth rate limiter doesn't block the test's own account-creation burst (every request comes from one IP, which the limiter is deliberately strict about):

```bash
NODE_ENV=test DB_NAME=scrs_loadtest PORT=5062 npm run db:reset
NODE_ENV=test DB_NAME=scrs_loadtest PORT=5062 node server.js &
BASE_URL=http://localhost:5062/api STUDENTS=300 HOT_SECTIONS=3 node scripts/load-test-registration.mjs
```

Findings from the last run (300 and 600 concurrent students across the 3 smallest-capacity sections): correctness held exactly at every scale (never one seat oversold, zero unexpected errors). Tail latency on the single most-contested section was 1.7–2.2s at 100 attempts/section and 2.6–3.8s at 200/section — this is MySQL's row lock on that section correctly serializing concurrent attempts, not the Sequelize connection pool (tripling `pool.max` made no measurable difference). The transaction holds that lock for its full duration, including the rule checks, notification, and audit-log write — trimming that critical section to just the seat check-and-increment would directly reduce this latency, at the cost of touching the core registration transaction; worth doing if a specific section's contention makes multi-second waits a real problem.

## Architecture

```
Request → Route → Middleware (auth, RBAC, zod validation) → Controller → Service → Model → MySQL
```

- **Auth:** the short-lived JWT access token is returned in the body. The refresh token is opaque and stored only as a sha256 hash. It is sent as an `httpOnly`, `SameSite=Strict` cookie scoped to `/api/auth`. Refresh rotates the token; reusing an old token revokes every session for that user.
- **Deployment: frontend and API as subdomains of one domain** (e.g. `app.university.edu` + `api.university.edu`) is the assumed, recommended setup. Subdomains of the same registrable domain are the same "site" for cookie purposes, so the refresh cookie's `SameSite=Strict` already works across them as-is — no cookie code needed changing for this. What actually has to be right is `CORS_ORIGIN`: it must be the frontend's exact `https://` origin, since a browser only sends cookies on a credentialed cross-origin request when the server echoes back that exact origin (never `*`) with `Access-Control-Allow-Credentials: true`. Get `CORS_ORIGIN` wrong and login/refresh fail silently in the browser — nothing here logs an error, since the browser itself withholds the cookie. `env.js` refuses to boot in production with a wildcard, an `http://` origin, or a leftover `localhost` origin, for exactly this reason. If the frontend ends up on a genuinely unrelated domain instead (no shared parent domain), the cookie's `sameSite` needs to change to `'none'` (plus real CSRF protection, since cross-site cookies are a CSRF vector without it) — that's a deliberate, separate decision, not this deployment's default.
- **Email** (`src/services/email.service.js`, via `nodemailer`): sends the password-reset link, and emails the notification types that matter even when the student isn't actively in the app — registration approved/rejected, a waitlist seat opening up, and grades being released or amended. Everyday in-app confirmations (adding a course, submitting) stay in-app only.
  - Configured with `SMTP_*` env vars. Optional in development — with no `SMTP_HOST`, emails are logged instead of sent, so local setup needs no mail server.
  - **Required in production:** the server refuses to start without `SMTP_HOST` and `SMTP_FROM` set, the same "no silent unsafe default" rule the seeding setup follows.
- **Strict revocation:** each access token carries a `jti` and a `ver`.
  - Logout (with the Bearer token) revokes that exact token immediately; revocations are stored in `revoked_access_tokens`.
  - `POST /auth/logout-all` bumps `users.token_version`, which kills every access token the user holds.
  - Password change or reset, suspension, role change and refresh-token theft also bump `token_version`.
  - The affected Socket.IO connections are disconnected.
  - An hourly job purges expired revocations and expired refresh tokens.
- **RBAC:** `authorize(...roles)` checks the role. `requirePermission(p)` checks the role→permission map in `src/utils/constants.js`.
- **Registration rules** (`src/services/registration/rules/`): the add flow runs every rule and returns **all** failures at once. The rules are:
  - registration window
  - student eligibility (academic hold)
  - section availability
  - program eligibility (the course must be on the student's program curriculum, `program_courses`)
  - duplicate course
  - prerequisites: all groups required, any course within a group satisfies it, optional minimum grade, advisor overrides
  - level
  - capacity
  - credit limit
  - timetable conflict
- **Submit** re-runs the rules across the whole selection, including min/max credits and **corequisites**. Corequisites (e.g. a lecture and its lab) only warn when a course is added, because the two halves are added one at a time; submitting without the partner is rejected.
- **Grades:**
  - Lecturers enter **provisional** grades for their own sections and then finalise them. Only **final** grades are visible to students and count for prerequisites and GPA.
  - After finalising, only the registrar can amend a grade, with a reason, and the change is audited.
  - Historical or transfer results can be bulk-imported.
  - Scale: A 4.0 … F 0, plus W and I. The pass mark comes from the `grades.passingGrade` setting.
  - `GET /students/me/results` returns `{ results, summary: { gpa, creditsAttempted, creditsEarned } }`.
- **Registration slip:** `GET /registrations/:id/slip` returns a printable A4 PDF (or `?format=json`).
  - It becomes available once the registration is submitted, and is watermarked PROVISIONAL until approved, then marked CONFIRMED.
  - Each slip carries a permanent reference number (`REG-2026-02-000014`, assigned on first submit) and a verification code.
  - Anyone can check a printout with `GET /registrations/verify/:reference?code=…`. A slip stops verifying once courses are added or dropped, or the status changes.
- **Registration priority:** registrars can stagger opening per semester with priority windows (by minimum level and/or program), and give individual students their own start time. A student who tries too early is told exactly when their registration opens.
- **Available courses:** `GET /registrations/available-courses` lists the current semester's sections for the student's program. It annotates each section by running the same rules, giving a `status` (`eligible` | `blocked` | `full` | `registered`) and `reasons[]`.
- **Waitlists:** a full section offers a waitlist only when the global setting `registration.waitlistEnabled` and the section's `waitlistEnabled` flag are both true.
- **Successful add:** returns `{ confirmation, registration }`, where `confirmation` holds the message, seats remaining and total/max credits. It also creates a `COURSE_REGISTERED` notification.
- **No overselling:** each add locks the registration row, then the section row (`SELECT … FOR UPDATE`). It also uses a guarded `seats_taken < capacity` update. A test fires 5 parallel requests at 1 seat and checks that exactly 1 succeeds.
- **Real-time:** Socket.IO authenticates with the access token (`io(url, { auth: { token } })`).
  - Every user joins `user:{id}`; staff also join `admin:dashboard`.
  - Clients emit `section:join` / `section:leave` with section IDs to receive `course.capacity.updated`.
  - Other events: `registration.created`, `registration.status.changed`, `timetable.updated`, `waitlist.seat.available` and `notification.created`.

## Observability
- **Logging** (`pino`): structured JSON lines in production and test, so a log aggregator (CloudWatch, Datadog, Better Stack, ...) can filter and alert on them; pretty-printed and colorized locally. Every HTTP request is logged with the same `requestId` returned in the `X-Request-Id` response header and in any error body — that's the thread to pull on when investigating a report. `GET /health` is excluded from request logging (it's polled constantly by uptime monitors and load balancers, and would otherwise be pure noise).
- **Error tracking** (`SENTRY_DSN`, optional — `@sentry/node`): every 5xx response, unhandled promise rejection and uncaught exception is reported, tagged with the same `requestId`, the route, and the user id when known. Unlike email/CORS, this is optional even in production — the app is fully functional without it, you just lose proactive alerting when something breaks. Worth setting up for a real deployment regardless.
- **`GET /api/health`**: reports `database` status and its latency, process `uptime`, and which optional integrations are configured (`email`, `errorTracking`) as booleans only — never a host or DSN, since this endpoint is intentionally public and unauthenticated (health checks can't log in).
- An uncaught exception is reported then the process exits — the correct, Node-recommended response, since the process may be in a broken state; let whatever's running it (systemd, Docker, the host's restart policy) start a clean one. An unhandled rejection is reported but not fatal, matching Node's own default.

## Endpoints (all under `/api`)

| Area | Endpoints |
|---|---|
| Auth | `POST auth/login` (`{ identifier: studentId or email, password }`), `logout, logout-all, refresh, forgot-password, reset-password` · `GET auth/me` · `PATCH auth/password` (staff) · `PATCH auth/pin`, `POST auth/pin/forgot, pin/reset` (students). No self sign-up. |
| Admission | `POST admissions` (one student: returns Student ID, school email and a one-time PIN) · `POST admissions/bulk` (`{ rows, dryRun? }`, keyed by `admissionNumber`) · `POST students/:id/reset-pin` |
| Courses | `GET/POST courses` · `GET/PATCH/DELETE courses/:id`. The list takes `search, departmentId, level, semesterId, status, sort (-code), page, limit`. |
| Prerequisites | `GET/POST courses/:courseId/prerequisites` (body `{ prerequisiteCourseId }` or `{ anyOf: [ids], minGrade?, type: prerequisite\|corequisite }`) · `DELETE courses/:courseId/prerequisites/:prerequisiteCourseId` · `GET courses/:courseId/prerequisites/check` · `GET/POST students/:id/prerequisite-overrides`, `DELETE students/:id/prerequisite-overrides/:overrideId` |
| Grades | `GET/PUT sections/:id/grades` · `POST sections/:id/grades/finalize` · `PATCH results/:id` · `POST results/import` |
| Academic periods | `GET/POST academic-years` · `GET semesters/current` · `GET/POST semesters` · `PATCH semesters/:id` · `GET/POST semesters/:id/priority-windows`, `PATCH/DELETE semesters/:id/priority-windows/:windowId` · `PUT semesters/:id/registration-overrides`, `DELETE semesters/:id/registration-overrides/:studentId` |
| Sections / schedules | `GET/POST sections`, `GET/PATCH/DELETE sections/:id` · `GET/POST schedules`, `GET/PATCH/DELETE schedules/:id` (room and lecturer clash checks) |
| Registration | `GET registrations/current, available-courses?search=&level=&departmentId=&eligibleOnly=, history` · `GET registrations/:id/slip[?format=json]` · `GET registrations/verify/:reference?code=` (public) · `POST registrations/items` · `DELETE registrations/items/:itemId` · `POST registrations/submit` |
| Waitlist | `POST waitlists` · `GET waitlists/me` · `DELETE waitlists/:id` |
| Timetable | `GET timetable/me` (student) · `GET timetable/lecturer/me` |
| Notifications | `GET notifications?unread=true` · `PATCH notifications/:id/read, read-all` |
| Bulk import | `POST admin/import/departments, programs, courses, program-courses, prerequisites, lecturers, students, sections` (body `{ rows, dryRun? }`, upsert by natural key) · `POST admin/import/invites` · `POST users/:id/invite`. See "Loading the institution's real data" in `docs/deployment-runbook.md`. |
| People | `users` (omit `password` on create to email an invite instead), `students` (`me`, `me/results`), `lecturers` (`me/sections`, `sections/:id/roster`), `departments`, `programs` (curriculum: `GET/POST programs/:id/courses`, `DELETE programs/:id/courses/:courseId`) |
| Admin | `GET admin/registrations` · `GET admin/registrations/:id/slip` · `PATCH admin/registrations/:id/approve, reject` · `GET admin/reports/course-popularity, registration-summary` · `GET admin/audit-logs` · `GET/PATCH admin/settings` |

Responses use `{ success, data, meta? }`. Errors use `{ success: false, error: { code, message, details? }, requestId }`.
