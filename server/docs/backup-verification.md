# Database Backup Verification (Aiven for MySQL)

Losing registration data is the worst failure mode this system has. This document is a checklist to
actually confirm what your Aiven for MySQL service guarantees — not an assumption about what a
managed database "probably" does.

## What Aiven for MySQL actually provides

Aiven takes daily full backups and continuously archives the binary log, which together allow
point-in-time recovery (PITR) — restoring to a moment between backups, not just to the last
snapshot. ([Aiven MySQL backups docs](https://aiven.io/docs/products/mysql/concepts/mysql-backups))

**Retention depends entirely on your plan tier** (confirmed from Aiven's own pricing page,
[aiven.io/pricing/mysql](https://aiven.io/pricing/mysql)):

| Plan | ~Monthly | Backup retention |
|---|---|---|
| Free / Developer | $0 / $5 | **Single backup only** — no rolling window |
| Hobbyist | $19 | 2 days |
| Startup | $75 | 14 days |
| Business | $180 | 30 days |
| Premium | $270 | 30 days |

**Recommendation: Startup or above.** Free, Developer, and Hobbyist don't give enough time to
notice a problem — a bad migration, an admin mistake, a subtle data bug — before the ability to
recover from it disappears. Two days or a single snapshot is not a real safety net for live student
registration data. Startup's 14-day window is the practical minimum I'd run this system on; Business
or Premium's 30 days if the budget allows it.

## How to actually restore: "Fork Database"

Aiven does not restore in place. It **forks** a backup into a brand new, independent service, which
is the safer pattern — you never touch the live database while checking whether a backup is good.
([Aiven docs: service forking](https://aiven.io/docs/platform/concepts/service-forking),
[console how-to](https://aiven.io/docs/platform/howto/console-fork-service))

1. Aiven Console → your MySQL service → **Backups**.
2. **Backup management** → **Fork & restore**.
3. Choose the backup to fork from (see the note below on point-in-time).
4. Give the fork a name, pick a region and plan.
5. **Create fork**.
6. Aiven provisions a brand-new service with that backup's data. Connect to it and verify the data
   is what you expect — then either promote it (point the app at it) or delete it once you're
   satisfied the backup was good.

**One thing to confirm yourself, in your own console:** Aiven's public docs say point-in-time
support "depends on the service type" without spelling out exactly how a specific timestamp
(rather than a whole day's backup) is selected in the Fork & restore screen for MySQL specifically.
When you do the checklist below, look at what the backup list actually shows you — it may offer
specific timestamps directly, or only whole-day backups. Note what you find in the log at the
bottom of this file.

## Checklist — do this once now, while nothing is on fire

Do this when the system is calm, not during an actual incident. The first time you try a restore
should not be the first time it matters.

- [ ] **Confirm your actual plan tier** in the Aiven Console (Service → Overview, or the billing
      page) and check it against the table above. If it's below Startup, that's worth fixing before
      going live.
- [ ] **Locate the Backups section** for your service and confirm backups are actually running (you
      should see at least one, ideally several days' worth already).
- [ ] **Perform one real test fork** following the steps above, into a new, temporary service.
- [ ] **Connect to the forked service** (e.g. `mysql -h <fork-host> -u <user> -p`) and confirm real
      tables and rows are present — `SHOW TABLES;` and a `SELECT COUNT(*) FROM users;` is enough to
      prove the fork isn't empty.
- [ ] **Delete the test fork** once confirmed, so it doesn't sit around costing money.
- [ ] **Record the real result below** — what you actually saw, not what was expected.

## Log

| Date | Plan tier confirmed | Fork tested? | Result |
|---|---|---|---|
| _fill in after running the checklist_ | | | |
