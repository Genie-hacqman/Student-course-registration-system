# Bulk import templates

CSV templates for `POST /api/admin/import/*` (see `server/README.md`'s "Bulk import" table and
`import.service.js`). Each file here is a header row plus one worked example row — replace the
example with real rows and keep the header exactly as given.

**Every import is an upsert keyed by natural key** (a code, an email, a staff number — never a
database id), so re-uploading a file with corrections is always safe: an omitted optional column
leaves the existing value alone, it does not clear it. **Run with `dryRun: true` first** (the
default for most of these): it validates and reports every row without writing anything.

**Go-live order** (each step depends on the previous one's codes existing):

1. `departments.csv`
2. `programs.csv`
3. `courses.csv`
4. `program-courses.csv` (curriculum: which courses belong to which programme)
5. `prerequisites.csv`
6. `lecturers.csv`
7. `students.csv` (bulk admission — creates Student IDs, school emails and one-time PINs)
8. `sections.csv` (course offerings for a semester, optionally with a lecturer and a timetable)
9. Staff invites: `POST /api/admin/import/invites` (no file — sends the set-your-password link to
   every staff account created without a password, in batches)

## Column reference

| File | Required columns | Optional columns | Notes |
|---|---|---|---|
| `departments.csv` | `code`, `name` | — | `code` is upper-cased automatically. |
| `programs.csv` | `code`, `name`, `departmentCode` | `durationYears`, `maxCredits`, `qualificationCode` | `departmentCode` must already exist. |
| `courses.csv` | `code`, `title`, `departmentCode`, `credits`, `level` | `description`, `status` | `level` is 100–900 in steps of 100. |
| `program-courses.csv` | `programCode`, `courseCode` | `type` (`core`\|`elective`), `recommendedLevel` | Adds the course to that programme's curriculum — a course is invisible to students until it's here. |
| `prerequisites.csv` | `courseCode`, `requiresAnyOf` | `type` (`prerequisite`\|`corequisite`, default `prerequisite`), `minGrade` | `requiresAnyOf` is `\|`-separated course codes forming one OR group (e.g. `MATH101\|MATH102` means either satisfies it). Import one row per required group; a course needing two independent groups gets two rows. |
| `lecturers.csv` | `email`, `firstName`, `lastName`, `staffNumber`, `departmentCode` | `title` | Creates the account with no password (`UNUSABLE_PASSWORD_HASH`) unless invites are sent (`sendInvites: true`, or run invites separately afterward). |
| `students.csv` | `firstName`, `lastName`, `programCode`, `admissionSession`, and one of `admissionNumber` **or** `studentNumber` | `level` (default 100) | This is `POST /api/admissions/bulk`, not a generic table import. `admissionSession` looks like `2026/2027`. The response's `credentials` column (Student ID, school email, one-time PIN) is only present for **newly created** rows and never for a dry run — export and hand these out once; they are never shown again. |
| `sections.csv` | `courseCode`, `capacity` | `semesterId` (defaults to the current semester), `sectionCode` (default `A`), `lecturerStaffNumber` (must already exist), `status`, `waitlistEnabled`, schedule columns | A schedule slot is `DAY HH:MM-HH:MM ROOM`, `;`-separated for more than one (e.g. `MON 09:00-10:00 LT1; WED 09:00-10:00 LT1`). Giving `schedules` **replaces** the section's whole timetable, so include every slot, not just new ones. |

## Course catalogue import (a different endpoint)

`POST /api/admin/import/course-catalog` is a separate, one-row-per-course-per-programme import that
creates courses, curriculum entries and prerequisites together (see `server/CLAUDE.md`). Its columns:
`courseCode`, `courseTitle`, `department` (code or exact name), `programme` (code), `level`,
`semester` (1–3, or `first`/`second`/`third`), `creditHours` (1–12), `courseType` (`core`\|`elective`),
`prerequisiteCourseCodes` (`;`, `,` or `\|`-separated, each one required), `academicYear` (optional,
existing `"YYYY/YYYY"`), `line` (optional, the spreadsheet row number for clearer error messages).
Unlike the imports above, this one **never overwrites** an existing course — see
`course-catalog.csv` for a worked example.
