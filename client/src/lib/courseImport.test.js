import { test } from 'node:test'
import assert from 'node:assert/strict'
import writeExcelFile from 'write-excel-file/node'
import {
  HEADERS, TEMPLATE_ROWS, templateCsv, checkHeaders, toApiRows, sheetToRecords, readSpreadsheet, reportCsv, normalizeHeader,
} from './courseImport.js'
import { parseCsv } from './csv.js'

const fileFrom = (name, content) => ({
  name,
  text: async () => content,
  arrayBuffer: async () => {
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content)
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  },
})

test('the template has exactly the required columns, and parses back into valid API rows', () => {
  assert.deepEqual(HEADERS, [
    'course_code', 'course_title', 'department', 'programme', 'level', 'semester', 'credit_hours', 'course_type',
    'prerequisite_course_codes', 'academic_year',
  ])
  const parsed = parseCsv(templateCsv())
  assert.deepEqual(checkHeaders(parsed.headers), { missing: [], unknown: [] })
  const [first] = toApiRows(parsed.records)
  assert.deepEqual(first, {
    line: 2, courseCode: 'CS205', courseTitle: 'Database Systems II', department: 'CS', programme: 'BSC-CS', level: '200',
    semester: '2', creditHours: '3', courseType: 'core', prerequisiteCourseCodes: 'CS101;CS203', academicYear: '2026/2027',
  })
})

test('headers are matched loosely; missing required and unknown columns are reported', () => {
  assert.equal(normalizeHeader(' Course Code '), 'course_code')
  assert.equal(normalizeHeader('credit-hours'), 'credit_hours')
  const { missing, unknown } = checkHeaders(['Course Code', 'course_title', 'Notes'])
  assert.deepEqual(missing, ['department', 'programme', 'level', 'semester', 'credit_hours', 'course_type'])
  assert.deepEqual(unknown, ['Notes'])
})

test('CSV quirks: quoted commas, blank lines skipped, spreadsheet lines kept', async () => {
  const csv = 'Course Code,course_title,department,programme,level,semester,credit_hours,course_type\r\n\r\nCS301,"Networks, Advanced",CS,BSC-CS,300,1,3,core\r\n'
  const { headers, records } = await readSpreadsheet(fileFrom('courses.CSV', csv))
  const [row] = toApiRows(records)
  assert.equal(checkHeaders(headers).missing.length, 0)
  assert.equal(row.line, 3)
  assert.equal(row.courseTitle, 'Networks, Advanced')
  assert.equal(row.prerequisiteCourseCodes, '')
})

test('a real .xlsx file is read into the same rows as the CSV', async () => {
  const sheet = [
    HEADERS,
    ['CS205', 'Database Systems II', 'CS', 'BSC-CS', 200, 2, 3, 'core', 'CS101;CS203', '2026/2027'],
    [],
    ['CS206', 'Web Development', 'CS', 'BSC-CS', 200, 1, 3, 'elective', null, null],
  ]
  const buffer = await writeExcelFile(sheet).toBuffer()
  const { headers, records } = await readSpreadsheet(fileFrom('Courses.xlsx', buffer))
  assert.deepEqual(checkHeaders(headers), { missing: [], unknown: [] })
  const rows = toApiRows(records)
  assert.equal(rows.length, 2, 'blank row skipped')
  assert.deepEqual(rows.map((r) => ({ ...r, line: undefined })), toApiRows(parseCsv(templateCsv()).records).map((r) => ({ ...r, line: undefined })))
  assert.deepEqual(rows.map((r) => r.line), [2, 4])
  assert.equal(TEMPLATE_ROWS.length, 2)
})

test('dates in a sheet become YYYY-MM-DD text; unsupported files get a clear message', async () => {
  assert.deepEqual(sheetToRecords([['a'], [new Date('2026-09-01T00:00:00Z')]]).records[0].values, { a: '2026-09-01' })
  await assert.rejects(readSpreadsheet(fileFrom('old.xls', '')), /\.xls files are not supported/)
  await assert.rejects(readSpreadsheet(fileFrom('notes.txt', '')), /\.csv or \.xlsx/)
})

test('the report lists every row with its outcome', () => {
  const csv = reportCsv([{ line: 2, courseCode: 'CS205', programme: 'BSC-CS', status: 'invalid', errors: ['a', 'b, c'] }])
  assert.deepEqual(parseCsv(csv).records[0].values, { line: '2', course_code: 'CS205', programme: 'BSC-CS', status: 'invalid', errors: 'a; b, c' })
})
