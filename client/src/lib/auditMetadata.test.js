import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summariseMetadata } from './auditMetadata.js'

test('before/after changes become one readable line each', () => {
  assert.deepEqual(
    summariseMetadata({ code: 'CS201', changes: { title: { from: 'Old', to: 'New' }, credits: { from: 3, to: 4 } } }),
    ['title: Old → New', 'credits: 3 → 4'],
  )
})

test('long text and personal data the server keeps out of the log read as "changed"', () => {
  assert.deepEqual(
    summariseMetadata({ changes: { description: { changed: true }, phone: { changed: true } } }),
    ['description changed', 'phone changed'],
  )
})

test('empty values read as "empty", not blank', () => {
  assert.deepEqual(summariseMetadata({ changes: { room: { from: null, to: 'LT-2' } } }), ['room: empty → LT-2'])
})

test('per-student changes list each student and say how many more there were', () => {
  const lines = summariseMetadata({ changed: 120, truncated: true, entries: [{ studentId: 7, from: 'D', to: 'B' }, { studentId: 9, from: null, to: 'A' }] })
  assert.deepEqual(lines, ['Student 7: D → B', 'Student 9: empty → A', '…and 118 more'])
})

test('imported rows show their key and outcome, replaced results show student and course', () => {
  assert.deepEqual(
    summariseMetadata({ rows: { changed: 2, entries: [{ row: 0, key: 'ADM-1', outcome: 'created' }, { row: 3, key: 'ADM-4', outcome: 'failed' }] } }),
    ['ADM-1: created', 'ADM-4: failed'],
  )
  assert.deepEqual(
    summariseMetadata({ overwritten: { changed: 1, entries: [{ studentNumber: 'STU1', courseCode: 'CS204', from: 'C', to: 'A' }] } }),
    ['STU1 CS204: C → A'],
  )
})

test('metadata with no change detail, or none at all, gives nothing', () => {
  assert.deepEqual(summariseMetadata({ code: 'CS201' }), [])
  assert.deepEqual(summariseMetadata(null), [])
  assert.deepEqual(summariseMetadata(undefined), [])
})
