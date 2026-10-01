# UniReg frontend

React + Vite frontend for [the SCRS backend](../server). Each role lands in its own area:
students in `/student` (applicants too — until admitted they only see their admission page), lecturers
in `/lecturer`, and admins and registrars in `/staff`, where each screen appears only if the role has the
permission for it. There are exactly four roles: ADMIN, REGISTRAR, LECTURER and STUDENT.

## Run it

1. Start the backend (`npm run dev` in `server/`). Note the `PORT` in its `.env`.
2. Point the dev proxy at it. Create `.env.local` here:
   ```
   API_TARGET=http://localhost:6060
   ```
   Without it the proxy uses `http://localhost:5000` (the backend's `.env.example` default).
   On macOS, port 5000 is often taken by AirPlay Receiver, so a different backend port is common.
3. `npm install`, then `npm run dev` and open http://localhost:5173.

Demo login (after the backend's `npm run db:seed:demo`): on the **Student** tab, `STU2025001` / `Student@12345`.

`npm run build` makes a production build; `npm run lint` runs oxlint.

Other demo logins: `lecturer@scrs.local` / `Lecturer@12345`, `registrar@scrs.local` / `Registrar@12345`,
`admin@scrs.local` / `Admin@12345`.

**Emails in development.** Without SMTP configured, the backend doesn't send email; it prints each
message to its console instead. To try email verification or password reset locally, copy the link
from the backend's terminal output.

## Loading real data

Staff with `course:manage`, `user:manage`, `student:admit` or `section:manage` get **Import data**
(`/staff/data-import`). It walks through the backend's bulk imports in dependency order: departments,
programmes, courses, curriculum, prerequisites, lecturers, students (bulk admission), course offerings,
then invites for staff.

- Each step offers a CSV template and parses the file in the browser (`src/lib/csv.js`, `src/lib/imports.js`).
- Rows with problems are flagged and skipped. The valid rows are sent as JSON.
- A file can be **checked** with a dry run before it's imported.
- Server errors are reported against the CSV line they came from.

The cell formats (e.g. `MATH101|MATH102`, `MON 09:00-10:00 LT1; WED 09:00-10:00 LT1`) and the go-live
order are documented in the backend's `docs/import-templates/README.md` and `docs/deployment-runbook.md`
(`server/docs/`).

`npm test` runs the parser tests (`node --test`, no browser needed). `npm run test:components` runs
component tests (Vitest + Testing Library + jsdom, `src/**/*.test.jsx`) — a thin layer over the
highest-stakes screens (password reset, the admin email log), not full page coverage.

## Student accounts

There is no self sign-up. The school admits students (**Students → Admit student**, or the admissions
step of **Import data**), which creates a Student ID, a school email and a temporary 6-digit PIN.
The PIN is shown **once**: in the credentials dialog (copy / print a slip) or the downloadable
credentials CSV. Before admitting anyone, set the student email domain in **System settings**.

- **Sign-in** has a Student tab (Student ID + PIN) and a Staff tab (email + password).
- **First sign-in** goes to `/change-pin`; every other page redirects there until the PIN is changed.
  An API 403 `PIN_CHANGE_REQUIRED` triggers the same redirect (`onPinChangeRequired` in `api/client.js`).
- **Forgot PIN** (`/forgot-pin`): Student ID + school email → emailed code → new PIN. Without SMTP the
  code is printed in the backend console.
- **Reset PIN** on a student's page issues a new temporary PIN (also shown once).
- PIN rules live in `src/lib/pin.js`, mirroring the backend.

## How it talks to the backend

- **Same origin in development.** Vite proxies `/api` and `/socket.io` to `API_TARGET`, so the
  browser only ever talks to `localhost:5173`. The refresh cookie (`scrs_refresh`, httpOnly,
  `SameSite=Strict`, path `/api/auth`) works without any CORS setup.
- **Tokens.** The access token is kept in memory only (never `localStorage`). On a 401, the Axios
  client (`src/api/client.js`) refreshes once and retries. Refresh tokens rotate and reusing an old one
  ends every session, so refreshes are never allowed to overlap: one shared request per tab plus a
  Web Lock across tabs. On page load the session is restored from the cookie.
- **Rules live on the server.** The catalog shows each section's status and reasons from
  `/registrations/available-courses`, which runs the same rules the add endpoint enforces. If an add is
  still refused (e.g. the page was stale), the rule failures from the 422 are shown in a dialog.
- **Real time.** `src/lib/socket.js` connects with the access token and turns server events into cache
  updates: live seat counts on the catalog, refreshed registration/timetable, and a toast for each new
  notification.

## Production

Set `VITE_API_URL` to the API's origin (e.g. `https://api.university.edu`) when running
`npm run build`, then serve `dist/` as a single-page app (unknown paths fall back to `index.html`).
The backend's refresh cookie is `SameSite=Strict`, so the app and API must share a registrable
domain (e.g. `app.university.edu` and `api.university.edu`); see the backend README.
Set the backend's `CORS_ORIGIN` and `FRONTEND_URL` to this app's URL (password-reset emails link to
`FRONTEND_URL/reset-password`).

## Layout

```
src/api/        Axios client + TanStack Query hooks per resource
src/auth/       Session state and route guards
src/lib/        Socket bridge, formatting, form helpers, roles
src/components/ Shared UI, section/course pieces, add-course flow
src/layouts/    Auth and student shells
src/pages/      auth/ and student/ screens
```
