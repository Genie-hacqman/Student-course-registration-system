import { readSheet } from 'read-excel-file/universal'
import { parseCsv, toCsv } from './csv.js'

export const MAX_ROWS = 5000

export const COLUMNS = [
  ['course_code', 'courseCode', true, 'Letters, numbers and dashes, e.g. CS205'],
  ['course_title', 'courseTitle', true, 'e.g. Database Systems II'],
  ['department', 'department', true, 'Department code (or exact name), e.g. CS'],
  ['programme', 'programme', true, 'Programme code, e.g. BSC-CS. One row per programme the course belongs to'],
  ['level', 'level', true, '100, 200, 300… up to the programme’s final level'],
  ['semester', 'semester', true, 'Term the course is taught in: 1, 2 or 3'],
  ['credit_hours', 'creditHours', true, 'Whole number from 1 to 12'],
  ['course_type', 'courseType', true, 'core or elective'],
  ['prerequisite_course_codes', 'prerequisiteCourseCodes', false, 'Codes separated by ; — each one is required. Blank for none'],
  ['academic_year', 'academicYear', false, 'Year the course joins the curriculum, e.g. 2026/2027 (must exist). Blank = already in effect'],
]
export const HEADERS = COLUMNS.map(([h]) => h)

export const TEMPLATE_ROWS = [
  {
    course_code: 'CS205', course_title: 'Database Systems II', department: 'CS', programme: 'BSC-CS', level: 200, semester: 2,
    credit_hours: 3, course_type: 'core', prerequisite_course_codes: 'CS101;CS203', academic_year: '2026/2027',
  },
  {
    course_code: 'CS206', course_title: 'Web Development', department: 'CS', programme: 'BSC-CS', level: 200, semester: 1,
    credit_hours: 3, course_type: 'elective', prerequisite_course_codes: '', academic_year: '',
  },
]

export const templateCsv = () => toCsv(HEADERS, TEMPLATE_ROWS)

export const normalizeHeader = (h) => String(h ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')

const cellText = (v) => {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).trim()
}

export const sheetToRecords = (data) => {
  const rows = data.map((cells, i) => ({ line: i + 1, cells: cells.map(cellText) })).filter((r) => r.cells.some((c) => c !== ''))
  const [head, ...body] = rows
  const headers = head ? head.cells : []
  return {
    headers,
    records: body.map(({ line, cells }) => ({ line, values: Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ''])) })),
  }
}

export const readSpreadsheet = async (file) => {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv')) return parseCsv(await file.text())
  if (name.endsWith('.xlsx')) return sheetToRecords(await readSheet(await file.arrayBuffer()))
  if (name.endsWith('.xls')) throw new Error('Old .xls files are not supported. Save the sheet as .xlsx or CSV and try again.')
  throw new Error('Choose a .csv or .xlsx file.')
}

export const checkHeaders = (headers) => {
  const present = new Set(headers.map(normalizeHeader))
  return {
    missing: COLUMNS.filter(([h, , required]) => required && !present.has(h)).map(([h]) => h),
    unknown: headers.filter((h) => h && !HEADERS.includes(normalizeHeader(h))),
  }
}

export const toApiRows = (records) => records.map(({ line, values }) => {
  const byHeader = Object.fromEntries(Object.entries(values).map(([h, v]) => [normalizeHeader(h), v]))
  return Object.fromEntries([['line', line], ...COLUMNS.map(([h, field]) => [field, byHeader[h] ?? ''])])
})

export const STATUS = {
  valid: { label: 'Ready', tone: 'green' },
  invalid: { label: 'Invalid', tone: 'red' },
  duplicate: { label: 'Duplicate', tone: 'amber' },
  imported: { label: 'Imported', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
}

export const reportCsv = (rows) => toCsv(
  ['line', 'course_code', 'programme', 'status', 'errors'],
  rows.map((r) => ({ line: r.line, course_code: r.courseCode, programme: r.programme, status: r.status, errors: r.errors.join('; ') })),
)
