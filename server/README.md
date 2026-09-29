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
npm run db:seed              # the four roles, default settings, one real admin — safe for production
npm run db:seed:demo         # dev/staging only: fake departments, courses, students — see warning below
npm run dev                  # http://localhost:5000/api/health
```

**`npm run db:seed` is the only seed command that is safe to run against a real database.** It creates
the four roles (ADMIN, REGISTRAR, LECTURER, STUDENT), the default settings, and one admin from `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`
— nothing else.

### Where the logins and the school domain live

- **Admin:** the `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` in your `.env`. Sign in on the **Staff** tab.
  **No accounts, or locked out?** Run `npm run admin:create`: it creates that admin if the database
  has none and changes nothing otherwise (use it when `db:seed` has already run and would fail on the roles).
- **Other staff:** created by an admin under **Users** or **Lecturers** (leave the password empty to email an invite).
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
| admin@scrs.local | Admin@12345 | ADMIN (only if you ran `db:seed` without setting `SEED_ADMIN_*` first) |
| registrar@scrs.local | Registrar@12345 | REGISTRAR |
| lecturer@scrs.local | Lecturer@12345 | LECTURER |
| student@scrs.local (or Student ID `STU2025001`) | Student@12345 | STUDENT (admitted, level 200, passed CS101 and MATH101) |

The demo "Current Semester" has its registration window open relative to the time you seed. CS203 and CS204 deliberately clash on Wednesday.

## Email (Resend)

All email goes through `src/services/email.service.js`. The provider is picked from the environment:

1. `RESEND_API_KEY` set: **Resend** (the official `resend` SDK).
2. Otherwise `SMTP_HOST` set: that SMTP relay (nodemailer), so an existing SMTP setup keeps working.
3. Otherwise: the email is **logged, not sent**, with token links shown as `token=[redacted]`. This is development only; in production the server refuses to start without a provider and a sender.

A failed email never undoes what triggered it. Admission, registration approval and password changes are committed first, and the email is sent afterwards. A failure is recorded and shown to staff; nothing is rolled back.

### What is emailed

| Email | When | Sent to |
|---|---|---|
| Account activation | An online application is admitted, or an admin resends it | The applicant's personal email |
| Application rejected (with the reason) | An application is rejected | The applicant |
| Email verification | Applicant sign-up, or "Send a new link" | The account email |
| Set-your-password invite | Staff account created without a password | The personal email if known, otherwise the account email |
| Password reset link | Forgot password (admins, applicants), or an approved staff request | The account email |
| Password reset completed / password changed | After the change is saved | The account email |
| PIN changed / PIN recovered | A student changes a (non-temporary) PIN, or resets it with the emailed code | The school email, plus the personal email from the application if there is one |
| PIN reset code | Forgot PIN | The school email |
| Registration submitted | A student submits | The student |
| Registration approved / needs changes (with the reason) | Registrar decision | The student |
| Timetable change | A section is rescheduled or cancelled | Everyone who gets the in-app notice |
| Announcement | Posted with **Also send by email** ticked | The audience (paced one at a time under Resend's rate limit) |
| Admin alerts | A new application, a staff account-change request | Active ADMINs |

**No email ever contains a password or a PIN.** Temporary PINs are only shown once on screen at admission. Links carry single-use tokens that expire. Only a hash of each token is stored, and each token is consumed atomically, so two clicks racing each other can't both use it.

### Delivery log, retries and duplicates

- Every send is recorded in `email_deliveries`: the template, recipient, subject, status, provider message id and a safe error. No message bodies are stored. Admins see it at **Audit Logs → Email log** (`GET /api/admin/email-deliveries`, `audit:view`).
- **Statuses:**
  - `sent` means Resend **accepted** the email; it isn't delivered yet.
  - `delivered`, `delivery_delayed`, `bounced` and `complained` come from the webhook.
  - `failed` means the API refused the email, or it failed later.
  - `not_configured` means no provider was set up.
- **No duplicates:** each email has an idempotency key, such as `activation:<user>:<token>` or `notification:<id>`. The key is also passed to Resend. A retried request whose email was already accepted sends nothing new.
- **Retrying a failure:** repeat the action. For example, **Resend activation** on the application, or request a new reset link. A new token gets a new key and a new email.

### Local setup

1. In the Resend dashboard, go to **API Keys** and create a key with **Sending access**. Put it in `server/.env` as `RESEND_API_KEY`. `.env` is gitignored: never commit a key, and never put it in client code.
2. Leave `EMAIL_FROM` empty to use Resend's onboarding sender, `onboarding@resend.dev`. **It only delivers to the email address that owns your Resend account.** Resend rejects anyone else with a validation error, and the email log shows it as *Failed*. To email real users, verify a domain (below) and set `EMAIL_FROM`.
3. Run `npm run db:migrate` to create `email_deliveries`.
4. Trigger an email to your own Resend address, for example by signing up as an applicant with it, or by using **Forgot password** as that user. Then check **Audit Logs → Email log**.
5. Optional: to test the delivery webhook locally, Resend must be able to reach your machine through a tunnel (such as ngrok or cloudflared) pointing at `/api/webhooks/resend`. Set `RESEND_WEBHOOK_SECRET` as well.

**Tests never call Resend.** They inject a fake provider with `setEmailProviderForTests`. Even with a real `RESEND_API_KEY` in `.env`, no real provider is used when `NODE_ENV=test` or when running under `node --test`.

### Deploying on Render

1. Resend dashboard (one-time, manual):
   1. **Domains → Add domain.** A subdomain such as `mail.yourschool.edu` is a good choice. Add the DNS records Resend lists (SPF and DKIM; DMARC recommended) at your DNS provider, then press **Verify** and wait until the domain shows *Verified*.
   2. **API Keys → Create API key.** Choose **Sending access**, restricted to that domain. Copy it now, because Resend shows it only once.
   3. **Webhooks → Add endpoint.** Use the URL `https://<your-api-host>/api/webhooks/resend` and select the events `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained` and `email.failed`. Copy the endpoint's **signing secret** (`whsec_…`).
2. Render dashboard → your API web service → **Environment**. Add each value; mark the key and secret as secret, and don't put them in `render.yaml` or the repo:
   - `RESEND_API_KEY`: the key from step 1.2.
   - `EMAIL_FROM`: for example `Your School <no-reply@mail.yourschool.edu>`, on the verified domain. The server refuses `@resend.dev` in production.
   - `RESEND_WEBHOOK_SECRET`: the signing secret from step 1.3.
   - `FRONTEND_URL`: the frontend's `https://` URL, used for every link in emails.
   - `SCHOOL_NAME`: shown in email headers until **System settings → Institution name** is changed from its default.
   - `SCHOOL_EMAIL_DOMAIN`: the domain of students' school email addresses.
   - If you are moving off SMTP, the `SMTP_*` variables can be removed. Resend is used whenever `RESEND_API_KEY` is set.
3. **Save changes** and redeploy. Run `npm run db:migrate` against the production database, the same way as for other releases, so `email_deliveries` exists.
4. Check: trigger a password reset for your own account. The email log should show *Accepted*, then *Delivered* once the webhook reports back. If it stays *Accepted*, check the webhook URL and `RESEND_WEBHOOK_SECRET`; the endpoint answers 503 without the secret and 400 for a bad signature.

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
- **Email** (`src/services/email.service.js`: Resend, else SMTP, else logged): account, security and registration emails, plus the notification types that matter away from the app. Branded templates live in `src/services/email/templates.js`. See [Email (Resend)](#email-resend).
  - Optional in development: with neither `RESEND_API_KEY` nor `SMTP_HOST` set, emails are logged instead of sent, so local setup needs no mail service.
  - **Required in production:** the server refuses to start without a provider and a sender (`EMAIL_FROM`), or with the Resend onboarding sender. This is the same "no silent unsafe default" rule the seeding setup follows.
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
  - prerequisites: all groups required, any course within a group satisfies it, optional minimum grade, registrar overrides
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
| Admin | `GET admin/registrations` · `GET admin/registrations/:id/slip` · `PATCH admin/registrations/:id/approve, reject` · `GET admin/reports/course-popularity, registration-summary` · `GET admin/audit-logs` · `GET admin/email-deliveries?status=&template=&search=` · `GET/PATCH admin/settings` |
| Webhooks | `POST webhooks/resend` (public; Svix-signed with `RESEND_WEBHOOK_SECRET`, raw body) |

Responses use `{ success, data, meta? }`. Errors use `{ success: false, error: { code, message, details? }, requestId }`.
