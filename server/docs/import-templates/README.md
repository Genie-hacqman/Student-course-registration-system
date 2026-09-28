# Import templates

Header rows for the bulk import endpoints (`POST /api/admin/import/<name>`), numbered in the order they
must be loaded. See "Loading the institution's real data" in [`../deployment-runbook.md`](../deployment-runbook.md).

The API takes JSON (`{ "rows": [...] }`), not CSV. The frontend (or a script) parses the CSV and sends
each line as one row object, with the headers as keys. Leave a cell empty to omit that field, which on
a re-import means "leave the stored value unchanged". Numbers may stay as strings; the API converts them.

Two columns hold lists and use this cell format, which the frontend converts to JSON:

| Column | Cell format | Sent as |
|---|---|---|
| `requiresAnyOf` (prerequisites) | `MATH101\|MATH102` | `["MATH101", "MATH102"]`, meaning either one satisfies the requirement |
| `schedules` (sections) | `MON 09:00-10:00 LT1; WED 09:00-10:00 LT1` | `[{ "day": "MON", "startTime": "09:00", "endTime": "10:00", "room": "LT1" }, …]` |

Allowed values:

| Field | Values |
|---|---|
| `level`, `recommendedLevel` | 100–900 |
| program course `type` | `core` (default), `elective` |
| prerequisite `type` | `prerequisite` (default), `corequisite` |
| `minGrade` | a passing grade letter, e.g. `C` |
| course `status` | `active` (default), `inactive` |
| section `status` | `open` (default), `closed`, `cancelled` |
| `waitlistEnabled` | `true` (default), `false` |
| `day` | `MON`, `TUE`, `WED`, `THU`, `FRI`, `SAT`, `SUN` |

- `7-admissions.csv` goes to `POST /api/admissions/bulk`, not `/admin/import`. `admissionSession` looks like `2026/2027`; `admissionNumber` is the admissions office's reference and keys each row, so re-running the file never admits anyone twice.
- Omit `studentNumber` (only for students who already have one) and one is generated: `STU` + session start year + id, e.g. `STU202600123`. The school email and a one-time PIN are generated too, and returned in the report's `credentials`.
- Omit `semesterId` and the section goes into the current semester.
