import { PERMS } from './roles.js'

/*
 * CSV → JSON rows for the bulk import endpoints (SCRS-backend `POST /api/admin/import/*`).
 * The cell formats follow SCRS-backend docs/import-templates/README.md.
 *
 * An empty cell omits the field instead of sending "": on a re-import the backend treats a
 * missing field as "leave the stored value unchanged". These checks only catch typos early;
 * the server validates everything again.
 */

export const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
export const MAX_ROWS_PER_REQUEST = 5000

// ── cell converters: each returns { value } or { problem } ────────────────────

const text = (v) => ({ value: v })
const upper = (v) => ({ value: v.toUpperCase() })
const lower = (v) => ({ value: v.toLowerCase() })

const int = (min, max) => (v) => {
  if (!/^-?\d+$/.test(v)) return { problem: 'must be a whole number' }
  const n = Number(v)
  if (n < min || n > max) return { problem: `must be between ${min} and ${max}` }
  return { value: n }
}

const oneOf = (values) => (v) => {
  const lowerCased = v.toLowerCase()
  return values.includes(lowerCased) ? { value: lowerCased } : { problem: `must be one of ${values.join(', ')}` }
}

/** "2026/2027": two consecutive years. */
const session = (v) => {
  if (!/^\d{4}\/\d{4}$/.test(v)) return { problem: 'must look like 2026/2027' }
  return Number(v.slice(5)) === Number(v.slice(0, 4)) + 1 ? { value: v } : { problem: 'must be two consecutive years' }
}

const bool = (v) => {
  const s = v.toLowerCase()
  if (['true', 'yes', 'y', '1'].includes(s)) return { value: true }
  if (['false', 'no', 'n', '0'].includes(s)) return { value: false }
  return { problem: 'must be true or false' }
}

/** "MATH101|MATH102" → ["MATH101", "MATH102"] */
export const parseCodeList = (v) => {
  const codes = v.split('|').map((c) => c.trim().toUpperCase()).filter(Boolean)
  return codes.length ? { value: codes } : { problem: 'needs at least one course code' }
}

const toMinutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
const pad = (t) => (t.length === 4 ? `0${t}` : t)

/** "MON 09:00-10:00 LT1; WED 9:00-10:00 Main Hall" → [{ day, startTime, endTime, room? }] */
export const parseSchedules = (v) => {
  const slots = []
  for (const part of v.split(';').map((p) => p.trim()).filter(Boolean)) {
    const m = part.match(/^([A-Za-z]{3})\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})(?:\s+(.+))?$/)
    if (!m) return { problem: `"${part}" should look like MON 09:00-10:00 LT1` }
    const [, day, start, end, room] = m
    const slot = { day: day.toUpperCase(), startTime: pad(start), endTime: pad(end) }
    if (!DAYS.includes(slot.day)) return { problem: `"${day}" is not a day (${DAYS.join(', ')})` }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.endTime)) {
      return { problem: `"${part}" has an invalid time` }
    }
    if (toMinutes(slot.endTime) <= toMinutes(slot.startTime)) return { problem: `"${part}" ends before it starts` }
    if (room) slot.room = room.trim()
    slots.push(slot)
  }
  return slots.length ? { value: slots } : { problem: 'needs at least one slot' }
}

// ── column definitions ────────────────────────────────────────────────────────

const col = (name, convert, { required = false, hint = '' } = {}) => ({ name, convert, required, hint })

const LEVEL = int(100, 900)

/**
 * The import steps, in the order they must be loaded: each may only reference records from the
 * steps above it. `permission` mirrors the backend route's requirement.
 */
export const IMPORT_STEPS = [
  {
    key: 'departments',
    label: 'Departments',
    permission: PERMS.COURSE_MANAGE,
    description: 'Academic departments. Everything else hangs off these.',
    columns: [
      col('code', upper, { required: true, hint: 'Short unique code, e.g. CS' }),
      col('name', text, { required: true }),
    ],
    example: { code: 'CS', name: 'Computer Science' },
  },
  {
    key: 'programs',
    label: 'Programmes',
    permission: PERMS.COURSE_MANAGE,
    description: 'Degree programmes students are admitted to.',
    columns: [
      col('code', upper, { required: true, hint: 'e.g. BSC-CS' }),
      col('name', text, { required: true }),
      col('departmentCode', upper, { required: true }),
      col('durationYears', int(1, 10), { hint: 'Default 4' }),
      col('maxCredits', int(1, 60), { hint: 'Credit limit per semester, default 24' }),
      col('qualificationCode', upper, { hint: 'e.g. BSC; shown on each student\'s profile' }),
    ],
    example: { code: 'BSC-CS', name: 'BSc Computer Science', departmentCode: 'CS', durationYears: 4, maxCredits: 24, qualificationCode: 'BSC' },
  },
  {
    key: 'courses',
    label: 'Courses',
    permission: PERMS.COURSE_CATALOG,
    description: 'The course catalogue.',
    columns: [
      col('code', upper, { required: true, hint: 'Letters, numbers and dashes, e.g. CS101' }),
      col('title', text, { required: true }),
      col('departmentCode', upper, { required: true }),
      col('description', text),
      col('credits', int(0, 12), { required: true }),
      col('level', LEVEL, { required: true, hint: '100–900' }),
      col('status', oneOf(['active', 'inactive']), { hint: 'Default active' }),
    ],
    example: { code: 'CS101', title: 'Introduction to Programming', departmentCode: 'CS', description: '', credits: 3, level: 100, status: 'active' },
  },
  {
    key: 'program-courses',
    label: 'Curriculum',
    permission: PERMS.COURSE_CATALOG,
    description: 'Which courses each programme\'s students may register for. A course missing here is invisible to students.',
    columns: [
      col('programCode', upper, { required: true }),
      col('courseCode', upper, { required: true }),
      col('type', oneOf(['core', 'elective']), { hint: 'Default core' }),
      col('recommendedLevel', LEVEL, { hint: 'Defaults to the course level' }),
    ],
    example: { programCode: 'BSC-CS', courseCode: 'CS101', type: 'core', recommendedLevel: 100 },
  },
  {
    key: 'prerequisites',
    label: 'Prerequisites',
    permission: PERMS.COURSE_CATALOG,
    description: 'One row is one requirement. Separate alternatives with | (any one satisfies it); separate rows are all required.',
    columns: [
      col('courseCode', upper, { required: true }),
      col('requiresAnyOf', parseCodeList, { required: true, hint: 'e.g. MATH101|MATH102' }),
      col('type', oneOf(['prerequisite', 'corequisite']), { hint: 'Default prerequisite' }),
      col('minGrade', upper, { hint: 'e.g. C; defaults to the passing grade' }),
    ],
    example: { courseCode: 'CS201', requiresAnyOf: 'CS101', type: 'prerequisite', minGrade: 'C' },
  },
  {
    key: 'lecturers',
    label: 'Lecturers',
    permission: PERMS.USER_MANAGE,
    invites: true,
    description: 'Teaching staff. Each gets an account with no password until they accept an invite.',
    columns: [
      col('email', lower, { required: true }),
      col('firstName', text, { required: true }),
      col('lastName', text, { required: true }),
      col('staffNumber', text, { required: true }),
      col('departmentCode', upper, { required: true }),
      col('title', text, { hint: 'e.g. Dr' }),
    ],
    example: { email: 'a.mensah@university.edu', firstName: 'Ama', lastName: 'Mensah', staffNumber: 'STF001', departmentCode: 'CS', title: 'Dr' },
  },
  {
    key: 'students',
    label: 'Students (admission)',
    // Not an /admin/import upsert: admission creates each student's ID, school email and PIN.
    endpoint: '/admissions/bulk',
    permission: PERMS.STUDENT_ADMIT,
    // Every new row hashes a PIN on the server, so requests are smaller than other imports.
    batchSize: 1000,
    credentials: true,
    description: 'Admits students: each new row gets a Student ID, a school email and a temporary PIN, returned once for the admission letters. Rows are keyed by admission number, so re-running a file never admits anyone twice.',
    columns: [
      col('firstName', text, { required: true }),
      col('lastName', text, { required: true }),
      col('programCode', upper, { required: true }),
      col('admissionSession', session, { required: true, hint: 'e.g. 2026/2027' }),
      col('admissionNumber', text, { hint: 'From the admissions office; keys the row' }),
      col('level', LEVEL, { hint: 'Default 100' }),
      col('studentNumber', upper, { hint: 'Only for students who already have an ID' }),
    ],
    check: (row) => (row.admissionNumber || row.studentNumber ? null : 'needs an admissionNumber (or the studentNumber of an existing student)'),
    example: { firstName: 'Kofi', lastName: 'Owusu', programCode: 'BSC-CS', admissionSession: '2026/2027', admissionNumber: 'ADM-2026-0001', level: 100, studentNumber: '' },
  },
  {
    key: 'sections',
    label: 'Course offerings',
    permission: PERMS.SECTION_MANAGE,
    description: 'Sections for a semester, with lecturer and timetable. Rooms and lecturers are checked for clashes.',
    columns: [
      col('courseCode', upper, { required: true }),
      col('semesterId', int(1, 1e9), { hint: 'Empty = the current semester' }),
      col('sectionCode', text, { hint: 'Default A' }),
      col('capacity', int(1, 2000), { required: true }),
      col('lecturerStaffNumber', text),
      col('status', oneOf(['open', 'closed', 'cancelled']), { hint: 'Default open' }),
      col('waitlistEnabled', bool, { hint: 'Default true' }),
      col('schedules', parseSchedules, { hint: 'MON 09:00-10:00 LT1; WED 09:00-10:00 LT1 (replaces the timetable)' }),
    ],
    example: {
      courseCode: 'CS101', semesterId: '', sectionCode: 'A', capacity: 60, lecturerStaffNumber: 'STF001',
      status: 'open', waitlistEnabled: 'true', schedules: 'MON 09:00-10:00 LT1; WED 09:00-10:00 LT1',
    },
  },
]

// ── file → rows ───────────────────────────────────────────────────────────────

/**
 * Checks the header row against a step's columns. Missing required columns make the whole file
 * unusable; unknown columns are ignored with a warning.
 */
export const checkHeaders = (step, headers) => {
  const known = new Set(step.columns.map((c) => c.name))
  const lowerToName = new Map(step.columns.map((c) => [c.name.toLowerCase(), c.name]))
  const present = new Set(headers.map((h) => lowerToName.get(h.toLowerCase()) ?? h))
  return {
    missing: step.columns.filter((c) => c.required && !present.has(c.name)).map((c) => c.name),
    unknown: headers.filter((h) => !known.has(lowerToName.get(h.toLowerCase()) ?? h)),
  }
}

/** One parsed CSV record → `{ row, problems }`. Header matching ignores case. */
export const toRow = (step, values) => {
  const byLower = new Map(Object.entries(values).map(([k, v]) => [k.toLowerCase(), v]))
  const row = {}
  const problems = []
  for (const column of step.columns) {
    const cell = byLower.get(column.name.toLowerCase()) ?? ''
    if (cell === '') {
      if (column.required) problems.push(`${column.name} is required`)
      continue
    }
    const { value, problem } = column.convert(cell)
    if (problem) problems.push(`${column.name} ${problem}`)
    else row[column.name] = value
  }
  const rowProblem = problems.length ? null : step.check?.(row)
  if (rowProblem) problems.push(`Row ${rowProblem}`)
  return { row, problems }
}

/** Parsed CSV (`parseCsv`) → preview rows `{ line, row, problems }`, plus header issues. */
export const prepare = (step, { headers, records }) => ({
  headers: checkHeaders(step, headers),
  rows: records.map(({ line, values }) => ({ line, ...toRow(step, values) })),
})

/** Template CSV content: the header row plus one example row. */
export const templateRows = (step) => ({ headers: step.columns.map((c) => c.name), rows: [step.example] })

/** Splits rows into request-sized batches. */
export const batches = (rows, size = MAX_ROWS_PER_REQUEST) => {
  const out = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

/** Where a step's rows are posted, and how many per request. */
export const endpointFor = (step) => step.endpoint ?? `/admin/import/${step.key}`
export const batchSizeFor = (step) => step.batchSize ?? MAX_ROWS_PER_REQUEST

/**
 * Merges per-batch reports; error and credential `row` indices become positions in the full list.
 * `credentials` (admission only) is present only when a batch returned it — never for a dry run.
 */
export const mergeReports = (reports, batchSize = MAX_ROWS_PER_REQUEST) => reports.reduce((acc, r, i) => ({
  dryRun: r.dryRun,
  created: acc.created + r.created,
  updated: acc.updated + r.updated,
  unchanged: acc.unchanged + r.unchanged,
  failed: acc.failed + r.failed,
  invited: acc.invited + (r.invited ?? 0),
  errors: [...acc.errors, ...r.errors.map((e) => ({ ...e, row: e.row + i * batchSize }))],
  ...(r.credentials || acc.credentials
    ? { credentials: [...(acc.credentials ?? []), ...(r.credentials ?? []).map((c) => ({ ...c, row: c.row + i * batchSize }))] }
    : {}),
}), { dryRun: false, created: 0, updated: 0, unchanged: 0, failed: 0, invited: 0, errors: [] })

/**
 * The credentials CSV for admission letters: one line per newly admitted student, joined back to the
 * uploaded rows (`sentRows[i]` is the row object sent, `lines[i]` its line in the source file).
 */
export const credentialsCsvRows = (credentials, sentRows, lines) => credentials.map((c) => ({
  line: lines[c.row],
  admissionNumber: sentRows[c.row]?.admissionNumber ?? '',
  firstName: sentRows[c.row]?.firstName ?? '',
  lastName: sentRows[c.row]?.lastName ?? '',
  studentNumber: c.studentNumber,
  schoolEmail: c.schoolEmail,
  pin: c.pin,
}))
export const CREDENTIAL_COLUMNS = ['line', 'admissionNumber', 'firstName', 'lastName', 'studentNumber', 'schoolEmail', 'pin']

/** A 422 field path such as "body.rows.3.email" or "rows.3.email" → { index: 3, field: "email" }. */
export const rowFieldFromPath = (field = '') => {
  const m = field.match(/(?:^|\.)rows\.(\d+)(?:\.(.+))?$/)
  return m ? { index: Number(m[1]), field: m[2] ?? '' } : null
}
