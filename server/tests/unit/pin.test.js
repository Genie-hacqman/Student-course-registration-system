import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pinProblem, generatePin, schoolEmailFor, sessionStartYear } from '../../src/utils/pin.js';
import { buildStudentNumber } from '../../src/services/student.service.js';

test('PINs must be 6 digits and not guessable', () => {
  assert.equal(pinProblem('482915'), null);
  assert.match(pinProblem('48291'), /6 digits/);
  assert.match(pinProblem('48291a'), /6 digits/);
  assert.match(pinProblem('000000'), /same digit/);
  for (const run of ['123456', '654321', '890123', '210987']) assert.match(pinProblem(run), /consecutive/, run);
  assert.match(pinProblem('600123', { studentNumber: 'STU202600123' }), /student ID/);
  assert.equal(pinProblem('600124', { studentNumber: 'STU202600123' }), null);
});

test('generated PINs always pass the rules', () => {
  for (let i = 0; i < 2000; i += 1) {
    const pin = generatePin({ studentNumber: 'STU202600123' });
    assert.equal(pinProblem(pin, { studentNumber: 'STU202600123' }), null, pin);
  }
});

test('Student IDs and school emails follow the admission format', () => {
  assert.equal(buildStudentNumber(123, 2026), 'STU202600123');
  assert.equal(schoolEmailFor('STU202600123', 'School.edu.gh'), 'stu202600123@school.edu.gh');
  assert.equal(sessionStartYear('2026/2027'), 2026);
});
