import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scrubUrl } from './scrub.js'

test('scrubUrl redacts token and code values, keeps everything else', () => {
  assert.equal(scrubUrl('https://unireg.example/activate-account?token=abc123'), 'https://unireg.example/activate-account?token=[redacted]')
  assert.equal(scrubUrl('/reset-password?x=1&token=SECRET&y=2'), '/reset-password?x=1&token=[redacted]&y=2')
  assert.equal(scrubUrl('/api/registrations/verify/REG-1?code=ZZZ9'), '/api/registrations/verify/REG-1?code=[redacted]')
  assert.equal(scrubUrl('/verify-email?TOKEN=Aa#top'), '/verify-email?TOKEN=[redacted]#top')
  assert.equal(scrubUrl('/student/profile'), '/student/profile')
  assert.equal(scrubUrl(undefined), undefined)
})
