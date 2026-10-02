# Deployment runbook (Render + Aiven for MySQL)

This is the step-by-step for taking SCRS from a laptop to a real, running deployment: a managed
MySQL database (Aiven), the API as a Render web service, and the frontend as a Render static site.
Read `server/README.md`'s "Setup" and "Email (Resend)" sections first — this runbook assumes you've
run the app locally at least once.

## 1. Provision the database (Aiven for MySQL)

**This must be a brand-new database that has never had `db:seed:demo` run against it, at any point in
its history** — not just one where `NODE_ENV` is now set to `production`. The demo seeders' hard
refusal under `NODE_ENV=production` protects the *seeding action itself*; it does nothing to stop a
database that already has demo data in it (from an earlier dev session, say) from being pointed at by
production later — the fake departments, courses and students are just already there, real-looking,
with no flag anywhere marking them as demo. If a database has ever run `db:seed:demo`, start over with
a fresh one for production rather than trying to clean it out afterward.

1. Create a MySQL service on [Aiven](https://aiven.io/mysql) (or any managed MySQL 8 provider — the
   app only needs a standard MySQL 8 connection, nothing Aiven-specific). Pick a plan with automated
   backups enabled; see `backup-verification.md` for what to check once it's running.
2. From the service overview, note the host, port, user, password and default database name.
   Aiven's default database is usually `defaultdb` — you can use that as `DB_NAME`, or create a
   dedicated one.
3. Add your Render service's outbound IP (or Aiven's "allow all" if you're relying on TLS + a strong
   password only) to the MySQL service's allowed IPs.
4. Aiven for MySQL requires TLS. Set `DB_SSL=true` in the API's environment (step 2.4) — **and
   `DB_SSL_CA` is required too, not just for strictness.** Aiven's default service certificate is
   self-signed, so without `DB_SSL_CA` the connection fails at boot with `Unable to connect to the
   database: self-signed certificate in certificate chain` — confirmed by an actual deploy, not just
   theory. Get the CA certificate from the Aiven console (the service's Overview/Connection
   information tab has a downloadable or copyable PEM block, including the `-----BEGIN
   CERTIFICATE-----`/`-----END CERTIFICATE-----` lines) and paste the whole thing as `DB_SSL_CA`'s
   value in Render (its environment variable fields accept multi-line values — paste real line breaks,
   not escaped `\n`). Without `DB_SSL=true` at all, the connection to Aiven fails a different way
   (Aiven requires TLS outright).

## 2. Deploy the API (Render web service)

1. **New Web Service** → connect the repo → set **Root Directory** to `server`.
2. **Build Command:** `npm ci`
3. **Start Command:** `node server.js`
4. **Environment → Environment Variables.** Set every one of these (mark secrets as secret):

   | Variable | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `PORT` | leave unset — Render injects its own and the app reads `process.env.PORT` |
   | `CORS_ORIGIN` | the frontend's exact `https://` origin (comma-separate if more than one) |
   | `FRONTEND_URL` | same origin, used to build every link in emails |
   | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | from Aiven |
   | `DB_SSL` | `true` — see step 1.4 |
   | `DB_SSL_CA` | Aiven's CA certificate, optional (pins it instead of trusting Node's default CA list) |
   | `JWT_ACCESS_SECRET` | a long random string (`openssl rand -hex 48`) — **not** the local dev value |
   | `RESEND_API_KEY` | from the Resend dashboard (see `server/README.md`'s Email section) |
   | `EMAIL_FROM` | an address on a Resend-verified domain — never the onboarding sender in production |
   | `RESEND_WEBHOOK_SECRET` | from the Resend webhook you add in step 5 |
   | `SCHOOL_NAME`, `SCHOOL_EMAIL_DOMAIN` | your institution's values |
   | `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | a real address and a strong, unique password — **not** the published default; the seeder refuses to run without these being real in production |
   | `SENTRY_DSN` | optional, but worth setting before go-live — see `server/README.md`'s Observability section |

   `env.js`'s production checks will refuse to boot if any of `CORS_ORIGIN`, `FRONTEND_URL`,
   `RESEND_API_KEY`/`EMAIL_FROM`, or `SEED_ADMIN_*` are missing or look like a dev default — that's
   intentional; fix the flagged variable rather than working around it.

5. **Resend dashboard (manual, one-time):** verify your sending domain, create a sending-scoped API
   key, and add a webhook to `https://<this-service>.onrender.com/api/webhooks/resend` (or your custom
   domain) for `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`,
   `email.failed`. Copy the signing secret into `RESEND_WEBHOOK_SECRET` above.
6. Deploy. Watch the boot log — a misconfigured production env var fails fast with a clear message
   (see `env.js`), rather than starting in a broken state.
7. Once it's up, run the database setup **once**, from your own machine, pointed at the production
   database (never from inside the running container — there's no shell step in this build):
   ```bash
   # Save Aiven's CA certificate locally first (same one used for DB_SSL_CA on Render, step 1.4).
   DB_HOST=<aiven-host> DB_PORT=<port> DB_NAME=<name> DB_USER=<user> DB_PASSWORD=<password> \
     DB_SSL=true DB_SSL_CA="$(cat aiven-ca.pem)" \
     NODE_ENV=production npm run db:migrate
   DB_HOST=<aiven-host> DB_PORT=<port> DB_NAME=<name> DB_USER=<user> DB_PASSWORD=<password> \
     DB_SSL=true DB_SSL_CA="$(cat aiven-ca.pem)" \
     SEED_ADMIN_EMAIL=<real-email> SEED_ADMIN_PASSWORD=<real-password> \
     NODE_ENV=production npm run db:seed
   ```
   Run both from the `server/` folder (that's where `ca.pem` is, and `server/ca.pem` is gitignored).
   Without `DB_SSL=true`/`DB_SSL_CA` here too, this fails with the exact same self-signed-certificate
   error as the running service did in step 2 — Aiven requires TLS for every connection, including
   this one-off local run, not just the deployed app's.
   `npm run db:seed` is the **only** seed command safe to run against a real database — it creates the
   four roles, the default settings and one real admin, nothing else. **Never** run `db:seed:demo` or
   `db:reset` here; every demo seeder refuses to run under `NODE_ENV=production` as a hard backstop,
   but don't rely on that — just don't invoke them against production.
8. Check `GET https://<api>/api/health` — it reports database status/latency and which optional
   integrations (`email`, `errorTracking`) are configured, without leaking any secret.

## 3. Deploy the frontend (Render static site)

1. **New Static Site** → connect the repo → **Root Directory** `client`.
2. **Build Command:** `npm ci && npm run build`
3. **Publish Directory:** `dist`
4. **Environment Variables:** `VITE_API_URL` = the API's origin from step 2 (e.g.
   `https://scrs-api.onrender.com`).
5. **Redirects/Rewrites:** add a catch-all rewrite `/* → /index.html` (status 200) — this is a
   single-page app; without it, refreshing on any route but `/` 404s.
6. Once deployed, go back to the API service and set `CORS_ORIGIN`/`FRONTEND_URL` to this static
   site's exact URL if you hadn't already, and redeploy the API.

## 4. Go-live data load

If you're loading a real institution's existing data (not just the essential seed above), follow
`docs/import-templates/README.md`'s column templates and order: departments → programmes → courses →
curriculum → prerequisites → lecturers → students (bulk admission) → course offerings → staff invites.
Every import supports `dryRun: true` — always dry-run a real file first and read the per-row report
before committing.

## Scaling beyond one instance

A single Render instance is the right choice for a first real deployment, and nothing here needs
changing to go live that way. But two things in this codebase are deliberately built single-instance
only, and **break silently, not loudly, if you scale to more than one instance without touching them
first:**

- **Rate limiting** (`src/middleware/rate-limit.middleware.js`) uses `express-rate-limit`'s default
  in-memory store. With two instances behind a load balancer, each one counts requests separately — a
  limit of 20 per 15 minutes quietly becomes up to 40, since whichever instance a request lands on has
  no idea what the other has already counted.
- **Socket.IO** (`src/sockets/socket.server.js`) has no adapter configured. A live update (e.g.
  `course.capacity.updated`) only reaches sockets connected to the *same* instance that emitted it — a
  student connected to a different instance simply never gets it, with no error anywhere to notice.

Neither of these needs fixing now. The trigger is the day you need more than one instance — for real
uptime requirements, or because one instance can't absorb a registration-rush load spike (see the load
testing section in `server/README.md` for what that load actually looks like). When that day comes:
add a Redis instance, then `rate-limit-redis` (a drop-in `store` option for the existing limiters) and
`@socket.io/redis-adapter` (passed to the `Server` constructor in `socket.server.js`). Both are small,
well-documented changes — the point of this note is making sure they happen *before* the second
instance goes live, not after someone notices rate limits or live updates behaving strangely.

## 5. Post-deploy checklist

- [ ] Sign in as the real seed admin; change nothing else until this works.
- [ ] **Immediately** set a real, unique password for the seed admin if you didn't already, and set
      **Settings → System settings → Student email domain** (admission refuses to run without it).
- [ ] Trigger one real email (e.g. sign up as an applicant with your own address) and confirm it shows
      **Accepted** then **Delivered** in **Audit Logs → Email log**.
- [ ] Confirm the webhook is live: the delivery above should move to `delivered` within a minute or
      two, not stay stuck on `sent`.
- [ ] Run through `docs/backup-verification.md` once, right after go-live, not just before you need it.
- [ ] Bookmark `GET /api/health` in your uptime monitor of choice.
- [ ] Turn on error tracking (see "Turning on error tracking" below) and confirm `/api/health` reports
      `"errorTracking": true`.

## Updating an existing deployment (migrations first)

The Render start command is just `node server.js`: **nothing migrates the database for you**, and a
new build assumes the schema it was written for. So every release that includes a new file in
`server/migrations/` follows the same order:

1. **Migrate first.** From your own machine, run `npm run db:migrate` against production with the
   explicit `DB_*` / `DB_SSL*` variables, exactly as in step 2.7. Check it prints each new migration as
   `migrated`.
2. **Then deploy** the new build (push, or **Manual Deploy** in Render).
3. Check `GET /api/health` (`database: "up"`) and sign in once as each role you changed.

Why this order: migrations here are written to be additive (new nullable columns or tables), so the
*old* build keeps working against the *new* schema during the gap. The reverse is not true. Deploying
the new build first makes every sign-in fail with an "Unknown column" 500 until the migration runs. The
profile-picture release (`20261011000001-user-avatar.cjs`, `20261011000002-user-avatar-thumb.cjs`) is
an example: it adds `users.avatar`, `users.avatar_thumb` and `users.avatar_updated_at`, and the login
path reads them.

Do **not** run migrations from inside the web service on boot: with more than one instance they would
race, and a schema change should be a deliberate step you watch. A migration that removes or renames a
column or table is not additive; it needs a two-release sequence (ship code that no longer uses it,
migrate, then drop it), so don't combine it with the code change.

## Turning on error tracking

The API already reports 5xx responses, unhandled rejections and uncaught exceptions to Sentry (tagged
with the request id, route and user id) when `SENTRY_DSN` is set. It is the only step left:

1. At sentry.io, create a project of type **Node.js / Express** and copy its **DSN**
   (Project settings → Client Keys).
2. In Render, add `SENTRY_DSN=<that DSN>` to the API service's environment and let it redeploy.
3. `GET /api/health` should now show `"errorTracking": true`.
4. Optional but worthwhile: in Sentry add an alert rule ("a new issue is created") that emails you.
   Without a rule you only see errors when you open Sentry.

The frontend is not instrumented; browser-side errors don't reach Sentry yet.

## Rolling back

There is no automatic rollback. To revert a bad deploy: redeploy the previous build in Render (build
artifacts are immutable per-deploy there), and if a migration needs undoing, run
`npm run db:migrate:undo` (one step) against production the same way as step 2.7, with the same
explicit `DB_*` variables — never rely on whatever `.env` your shell happens to have loaded.

Roll the **code** back first (previous Render build), and only then, if you must, undo the migration:
undoing it while the new build is still serving traffic breaks the same way as deploying before
migrating. Undoing the profile-picture migrations deletes every stored picture, so avoid it unless the
columns themselves are the problem.
