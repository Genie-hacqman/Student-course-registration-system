# Backup verification

A backup you haven't restored is a guess, not a backup. This is the procedure for actually proving
one works — run it right after go-live, then on a recurring schedule (monthly is a reasonable
default; more often once real student data is in the system and a registration period is imminent).

## 1. Confirm backups are actually being taken

If you're on Aiven for MySQL (see `deployment-runbook.md`): **Aiven console → your service →
Backups.** Confirm:
- There is a backup newer than 24 hours old.
- The retention window matches what you actually need (Aiven's default varies by plan — check it,
  don't assume).

If you're using a different provider or self-managed MySQL, confirm whatever equivalent automated
backup mechanism it offers is enabled, and that you know how to trigger a point-in-time or snapshot
restore from it into a **new**, separate database — never restore over the live one during this
check.

## 2. Restore into a scratch database

Restore the most recent backup into a **new, disposable** database (a new Aiven service, or a
separate schema on a scratch server) — never the production database, and never your local dev
database either, so this never risks real data.

## 3. Point a throwaway app instance at the restored data

```bash
DB_HOST=<scratch-host> DB_PORT=<scratch-port> DB_NAME=<scratch-name> \
  DB_USER=<scratch-user> DB_PASSWORD=<scratch-password> \
  PORT=5090 NODE_ENV=production \
  RESEND_API_KEY= SMTP_HOST= \
  CORS_ORIGIN=http://localhost:5090 FRONTEND_URL=http://localhost:5090 \
  JWT_ACCESS_SECRET=temporary-verification-secret-at-least-32-characters-long \
  SEED_ADMIN_EMAIL=verify@example.com SEED_ADMIN_PASSWORD=TemporaryVerify123! \
  node server.js
```
(Leaving `RESEND_API_KEY`/`SMTP_HOST` empty here is deliberate: this check has nothing to do with
email delivery, and it avoids sending anything real from restored data. Run this from `server/`, with
its dependencies already installed.)

## 4. Sanity checks against the restored data

Don't just confirm the process boots — confirm the data is actually there and coherent:

- [ ] `GET /api/health` returns `200` with `database: "ok"`.
- [ ] Sign in as a real staff account that existed at backup time (not the temporary seed admin
      above) and confirm the login works and their role/permissions look right.
- [ ] Spot-check a handful of real records: a recent registration, a recent grade entry, a recent
      admission — do the row counts and the most recent `updated_at` timestamps line up with what you
      expect for when the backup was taken?
- [ ] `GET /api/admin/email-deliveries` (as admin) — confirm the delivery log table exists and has
      rows (a missing table here would mean the backup predates a migration that's since been applied
      to production, a sign the backup and the running app's schema have drifted apart).
- [ ] Run `npm run db:migrate` against the **scratch** database and confirm it reports "up to date" —
      if it tries to apply migrations that production already has, the backup is stale relative to the
      schema, which changes how much data a real restore would actually recover.

## 5. Tear down

Stop the throwaway instance and delete the scratch database/service once the checks above pass.
Nothing from this process should be left running or reachable afterward.

## 6. Record the result

Note the date, which backup was restored, and the outcome (pass/fail, with specifics on any
mismatch) somewhere your team will actually see it before the next scheduled check — a backup
strategy nobody re-verifies tends to quietly stop working long before anyone needs it.
