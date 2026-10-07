import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ALL_ROUTE_PATTERNS, metaFor } from './pageMeta.js'

const ALIASES = new Set(['/', '/activate'])
const sample = (pattern) => pattern.replace(/:\w+/g, '123')

test('every route has its own title and description', () => {
  const metas = ALL_ROUTE_PATTERNS.filter((p) => !ALIASES.has(p)).map((p) => [p, metaFor(sample(p))])
  const titles = new Map()
  const descriptions = new Map()
  for (const [pattern, { title, description }] of metas) {
    assert.ok(title && description, `${pattern} is missing a title or description`)
    assert.ok(!titles.has(title), `${pattern} shares the title "${title}" with ${titles.get(title)}`)
    assert.ok(!descriptions.has(description), `${pattern} shares its description with ${descriptions.get(description)}`)
    titles.set(title, pattern)
    descriptions.set(description, pattern)
  }
})

test('only the public entry pages are indexable', () => {
  for (const path of ['/login', '/apply', '/privacy', '/terms']) assert.equal(metaFor(path).noindex, false, path)
  for (const path of ['/student', '/staff/users/9', '/reset-password', '/verify-email', '/activate-account', '/change-pin']) {
    assert.equal(metaFor(path).noindex, true, path)
  }
})

test('a static segment beats an :id segment', () => {
  assert.match(metaFor('/staff/courses/import').title, /^Import courses/)
  assert.match(metaFor('/staff/courses/42').title, /^Course ·/)
})

test('unknown paths get the not-found meta and noindex', () => {
  const meta = metaFor('/no/such/page')
  assert.match(meta.title, /^Page not found/)
  assert.equal(meta.noindex, true)
})
