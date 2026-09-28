import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCsv, toCsv } from './csv.js'
import {
  IMPORT_STEPS, prepare, parseSchedules, parseCodeList, batches, mergeReports, rowFieldFromPath, templateRows,
  endpointFor, batchSizeFor, credentialsCsvRows,
} from './imports.js'

const step = (key) => IMPORT_STEPS.find((s) => s.key === key)

test('steps follow the backend dependency order', () => {
  assert.deepEqual(IMPORT_STEPS.map((s) => s.key), [
    'departments', 'programs', 'courses', 'program-courses', 'prerequisites', 'lecturers', 'students', 'sections',
  ])
})

test('empty cells are omitted, codes upper-cased, numbers converted', () => {
  const { rows } = prepare(step('courses'), parseCsv('code,title,departmentCode,description,credits,level,status\ncs101,Intro,cs,,3,100,\n'))
  assert.deepEqual(rows[0], { line: 2, row: { code: 'CS101', title: 'Intro', departmentCode: 'CS', credits: 3, level: 100 }, problems: [] })
})

test('bad cells become problems, not requests', () => {
  const { rows } = prepare(step('courses'), parseCsv('code,title,departmentCode,credits,level,status\nCS1,,CS,three,1000,maybe\n'))
  assert.deepEqual(rows[0].problems, [
    'title is required', 'credits must be a whole number', 'level must be between 100 and 900', 'status must be one of active, inactive',
  ])
})

test('headers: required ones missing, unknown ones reported, case ignored', () => {
  const { headers } = prepare(step('students'), parseCsv('FIRSTNAME,lastname,programCode,nickname\n'))
  assert.deepEqual(headers, { missing: ['admissionSession'], unknown: ['nickname'] })
})

test('list columns', () => {
  assert.deepEqual(parseCodeList('math101 | MATH102|'), { value: ['MATH101', 'MATH102'] })
  assert.deepEqual(parseSchedules('mon 9:00-10:00 Main Hall; WED 09:00 - 10:30'), {
    value: [
      { day: 'MON', startTime: '09:00', endTime: '10:00', room: 'Main Hall' },
      { day: 'WED', startTime: '09:00', endTime: '10:30' },
    ],
  })
  assert.match(parseSchedules('MON 10:00-09:00').problem, /ends before it starts/)
  assert.match(parseSchedules('XYZ 09:00-10:00').problem, /not a day/)
  assert.match(parseSchedules('Monday morning').problem, /should look like/)
})

test('booleans accept yes/no forms', () => {
  const { rows } = prepare(step('sections'), parseCsv('courseCode,capacity,waitlistEnabled\nCS101,10,No\nCS102,10,sure\n'))
  assert.equal(rows[0].row.waitlistEnabled, false)
  assert.deepEqual(rows[1].problems, ['waitlistEnabled must be true or false'])
})

test('every template parses back without problems', () => {
  for (const s of IMPORT_STEPS) {
    const { headers, rows } = templateRows(s)
    const prepared = prepare(s, parseCsv(toCsv(headers, rows)))
    assert.deepEqual(prepared.headers, { missing: [], unknown: [] }, s.key)
    assert.deepEqual(prepared.rows[0].problems, [], s.key)
  }
})

test('batches and merged reports keep row positions', () => {
  assert.deepEqual(batches([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
  const merged = mergeReports([
    { dryRun: true, created: 2, updated: 0, unchanged: 0, failed: 1, invited: 0, errors: [{ row: 1, message: 'a' }] },
    { dryRun: true, created: 1, updated: 1, unchanged: 0, failed: 1, invited: 0, errors: [{ row: 0, message: 'b' }] },
  ], 3)
  assert.equal(merged.created, 3)
  assert.equal(merged.dryRun, true)
  assert.deepEqual(merged.errors.map((e) => e.row), [1, 3])
})

test('422 field paths map to a row and field', () => {
  assert.deepEqual(rowFieldFromPath('rows.3.email'), { index: 3, field: 'email' })
  assert.deepEqual(rowFieldFromPath('rows.12.schedules.0.endTime'), { index: 12, field: 'schedules.0.endTime' })
  assert.equal(rowFieldFromPath('dryRun'), null)
})

test('students are admitted through their own endpoint, in smaller batches', () => {
  assert.equal(endpointFor(step('students')), '/admissions/bulk')
  assert.equal(batchSizeFor(step('students')), 1000)
  assert.equal(endpointFor(step('courses')), '/admin/import/courses')
  assert.equal(batchSizeFor(step('courses')), 5000)
})

test('admission rows need a session of consecutive years and a key', () => {
  const csv = 'firstName,lastName,programCode,admissionSession,admissionNumber,studentNumber\n'
    + 'Ama,Owusu,bsc-cs,2026/2027,ADM-1,\n'
    + 'Kofi,Mensah,BSC-CS,2026/2028,ADM-2,\n'
    + 'Yaw,Boateng,BSC-CS,2026/2027,,\n'
    + 'Esi,Asante,BSC-CS,2026/2027,,stu2025001\n'
  const { rows } = prepare(step('students'), parseCsv(csv))
  assert.deepEqual(rows[0].row, { firstName: 'Ama', lastName: 'Owusu', programCode: 'BSC-CS', admissionSession: '2026/2027', admissionNumber: 'ADM-1' })
  assert.deepEqual(rows[1].problems, ['admissionSession must be two consecutive years'])
  assert.match(rows[2].problems[0], /needs an admissionNumber/)
  assert.deepEqual([rows[3].problems, rows[3].row.studentNumber], [[], 'STU2025001'])
})

test('credentials merge across batches and join back to the uploaded rows', () => {
  const merged = mergeReports([
    { dryRun: false, created: 1, updated: 0, unchanged: 0, failed: 0, errors: [], credentials: [{ row: 0, studentNumber: 'STU202600001', schoolEmail: 'a@x.edu', pin: '482915' }] },
    { dryRun: false, created: 1, updated: 0, unchanged: 0, failed: 0, errors: [], credentials: [{ row: 0, studentNumber: 'STU202600002', schoolEmail: 'b@x.edu', pin: '739204' }] },
  ], 2)
  assert.deepEqual(merged.credentials.map((c) => c.row), [0, 2])
  const csvRows = credentialsCsvRows(merged.credentials, [{ firstName: 'Ama', admissionNumber: 'ADM-1' }, {}, { firstName: 'Kofi', admissionNumber: 'ADM-3' }], [2, 3, 4])
  assert.deepEqual(csvRows.map((r) => [r.line, r.firstName, r.admissionNumber, r.pin]), [[2, 'Ama', 'ADM-1', '482915'], [4, 'Kofi', 'ADM-3', '739204']])
  assert.equal(mergeReports([{ dryRun: true, created: 1, updated: 0, unchanged: 0, failed: 0, errors: [] }]).credentials, undefined)
})
