import { test } from 'node:test'
import assert from 'node:assert/strict'
import { joinLocal, localDateTime, splitLocal } from './dateTime.js'

const problem = (schema, value) => {
  const result = schema.safeParse(value)
  return result.success ? null : result.error.issues[0].message
}

test('splits a combined value into its date and time, and tolerates a half-filled one', () => {
  assert.deepEqual(splitLocal('2027-05-01T09:30'), { date: '2027-05-01', time: '09:30' })
  assert.deepEqual(splitLocal('2027-05-01T'), { date: '2027-05-01', time: '' })
  assert.deepEqual(splitLocal('T09:30'), { date: '', time: '09:30' })
  for (const empty of ['', undefined, null]) assert.deepEqual(splitLocal(empty), { date: '', time: '' })
})

test('joins the two boxes back, keeping a half-filled field and clearing an empty one', () => {
  assert.equal(joinLocal('2027-05-01', '09:30'), '2027-05-01T09:30')
  assert.equal(joinLocal('2027-05-01', ''), '2027-05-01T')
  assert.equal(joinLocal('', '09:30'), 'T09:30')
  assert.equal(joinLocal('', ''), '')
  for (const value of ['2027-05-01T09:30', '2027-05-01T', 'T09:30', '']) {
    const { date, time } = splitLocal(value)
    assert.equal(joinLocal(date, time), value, value)
  }
})

test('a required date-time says which half is missing', () => {
  const required = localDateTime({ required: true })
  assert.equal(problem(required, '2027-05-01T09:30'), null)
  assert.equal(problem(required, ''), 'Required')
  assert.equal(problem(required, '2027-05-01T'), 'Choose a time')
  assert.equal(problem(required, 'T09:30'), 'Choose a date')
  assert.equal(problem(required, '2027-5-1T9:30'), 'Enter a valid date and time')
})

test('an optional date-time may be left empty or be left out, but not half filled', () => {
  const optional = localDateTime({ required: false })
  assert.equal(problem(optional, ''), null)
  assert.equal(problem(optional, undefined), null)
  assert.equal(problem(optional, '2027-05-01T09:30'), null)
  assert.equal(problem(optional, '2027-05-01T'), 'Choose a time')
  assert.equal(problem(optional, 'T09:30'), 'Choose a date')
})
