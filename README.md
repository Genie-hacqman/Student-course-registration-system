# SCRS — Student Course Registration System

A full university course-registration system: online admission, a rules-based registration engine
(prerequisites, corequisites, waitlists, timetable conflicts, capacity), grades, attendance and
assessments, lecturer and course-offering management, real-time updates, and transactional email
via Resend. Four roles: **ADMIN**, **REGISTRAR**, **LECTURER**, **STUDENT**.

This repo holds two independent projects, run together in development:

- **[`server/`](server/)** — Express 5 + Sequelize (MySQL) + Socket.IO API. Start here for
  architecture, environment variables, testing and deployment: **[`server/README.md`](server/README.md)**,
  and **[`server/CLAUDE.md`](server/CLAUDE.md)** for the deeper "why" behind non-obvious decisions.
- **[`client/`](client/)** — React 19 + Vite frontend. See **[`client/README.md`](client/README.md)**.

## Run both together

```bash
npm run install:all   # installs server/ and client/ dependencies
cd server && cp .env.example .env   # fill in DB_*, JWT_ACCESS_SECRET, etc. — see server/README.md
cd .. && npm run migrate
npm run dev            # both, concurrently: http://localhost:5173 (proxying to the API)
```

- `npm run dev:nomail` — same, but forces email into log-only mode regardless of `.env`.
- `npm run migrate` — runs the backend's pending migrations (`server`'s `db:migrate`).

Deploying for real? Start with **[`server/docs/deployment-runbook.md`](server/docs/deployment-runbook.md)**
and **[`server/docs/backup-verification.md`](server/docs/backup-verification.md)**.

## Tests

Each half tests independently — see its own README for the exact commands
(`server/README.md`'s "Tests" section, `client/README.md`'s `npm test`/`npm run lint`).
`.github/workflows/ci.yml` runs both on every push and pull request.
