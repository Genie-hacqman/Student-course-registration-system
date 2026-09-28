import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCsv, toCsv } from './csv.js'

test('quoted fields keep commas, quotes and newlines; lines point at the source', () => {
  const { headers, records } = parseCsv('﻿code,title\r\nCS101,"Intro, part 1"\r\n\r\nCS102,"Say ""hi""\nsecond line"\r\nCS103,Plain\r\n')
  assert.deepEqual(headers, ['code', 'title'])
  assert.deepEqual(records, [
    { line: 2, values: { code: 'CS101', title: 'Intro, part 1' } },
    { line: 4, values: { code: 'CS102', title: 'Say "hi"\nsecond line' } },
    { line: 6, values: { code: 'CS103', title: 'Plain' } },
  ])
})

test('missing trailing cells are empty, cells are trimmed, no final newline is fine', () => {
  const { records } = parseCsv('a, b ,c\n 1 ,2')
  assert.deepEqual(records[0].values, { a: '1', b: '2', c: '' })
})

test('empty input has no headers or records', () => {
  assert.deepEqual(parseCsv(''), { headers: [], records: [] })
})

test('toCsv quotes only what needs it and round-trips', () => {
  const out = toCsv(['code', 'title'], [{ code: 'CS101', title: 'A, "B"' }])
  assert.equal(out, 'code,title\r\nCS101,"A, ""B"""\r\n')
  assert.deepEqual(parseCsv(out).records[0].values, { code: 'CS101', title: 'A, "B"' })
})
