import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avatarFileError, squareCrop } from './image.js'

test('squareCrop takes the centred square of a landscape or portrait image', () => {
  assert.deepEqual(squareCrop(400, 200), { sx: 100, sy: 0, size: 200 })
  assert.deepEqual(squareCrop(200, 500), { sx: 0, sy: 150, size: 200 })
  assert.deepEqual(squareCrop(300, 300), { sx: 0, sy: 0, size: 300 })
})

test('avatarFileError accepts JPG/PNG/WebP up to 5 MB and explains anything else', () => {
  assert.equal(avatarFileError({ type: 'image/png', size: 1000 }), null)
  assert.match(avatarFileError(undefined), /Choose/)
  assert.match(avatarFileError({ type: 'image/gif', size: 1000 }), /JPG, PNG or WebP/)
  assert.match(avatarFileError({ type: 'application/pdf', size: 1000 }), /JPG, PNG or WebP/)
  assert.match(avatarFileError({ type: 'image/jpeg', size: 6 * 1024 * 1024 }), /5 MB/)
})
