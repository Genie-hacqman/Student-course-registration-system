import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pinProblem } from './pin.js'

test('matches the server rules for shape, repeats and runs', () => {
  assert.equal(pinProblem('482915'), null)
  assert.match(pinProblem('48291'), /6 digits/)
  assert.match(pinProblem('4829a5'), /6 digits/)
  assert.match(pinProblem('777777'), /same digit/)
  for (const run of ['123456', '654321', '890123', '210987']) assert.match(pinProblem(run), /consecutive/, run)
})
