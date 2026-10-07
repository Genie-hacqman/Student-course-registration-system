import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createTtlSet } from '../../src/utils/ttl-set.js';
import { createLimiter } from '../../src/middleware/rate-limit.middleware.js';

describe('createTtlSet', () => {
  test('the first sighting of a key is new; a repeat inside the window is not', () => {
    const set = createTtlSet();
    assert.equal(set.seen('a', 1000, 0), false);
    assert.equal(set.seen('a', 1000, 500), true);
    assert.equal(set.seen('b', 1000, 500), false, 'keys are independent');
  });

  test('a key is new again once its window has passed, and the new window starts then', () => {
    const set = createTtlSet();
    set.seen('a', 1000, 0);
    assert.equal(set.seen('a', 1000, 1000), false, 'expired exactly at the boundary');
    assert.equal(set.seen('a', 1000, 1500), true, 'and the new window runs from the second sighting');
    assert.equal(set.seen('a', 1000, 2001), false);
  });

  test('a repeat inside the window does not extend it', () => {
    const set = createTtlSet();
    set.seen('a', 1000, 0);
    set.seen('a', 1000, 900);
    assert.equal(set.seen('a', 1000, 1000), false, 'still expires 1000ms after the first sighting');
  });

  test('stays bounded under a burst of distinct keys, dropping the oldest', () => {
    const set = createTtlSet({ max: 100 });
    for (let i = 0; i < 1000; i += 1) set.seen(`k${i}`, 60_000, i);
    assert.ok(set.size <= 100, `size ${set.size}`);
    assert.equal(set.seen('k999', 60_000, 1000), true, 'the newest keys are kept');
    assert.equal(set.seen('k0', 60_000, 1000), false, 'the oldest were dropped');
  });

  test('sweeps expired keys so a quiet period frees memory', () => {
    const set = createTtlSet({ max: 10_000 });
    for (let i = 0; i < 600; i += 1) set.seen(`k${i}`, 10, 0);
    for (let i = 0; i < 500; i += 1) set.seen(`later${i}`, 10, 1_000_000);
    assert.ok(set.size < 600, `expired keys were swept (size ${set.size})`);
  });
});

describe('rate limiter audit hook', () => {
  const appWith = (limit, onBlocked) => {
    const app = express();
    app.post('/x', createLimiter(60_000, limit, 'slow down', { skip: () => false, name: 'probe', onBlocked }), (req, res) => res.json({ ok: true }));
    return app;
  };

  test('records only the first blocked request of a window, with the limiter name and limit', async () => {
    const seen = [];
    const app = appWith(2, async (req, info) => { seen.push({ info, method: req.method, path: req.path }); });

    for (let i = 0; i < 2; i += 1) assert.equal((await request(app).post('/x')).status, 200);
    assert.deepEqual(seen, [], 'allowed requests record nothing');

    for (let i = 0; i < 6; i += 1) assert.equal((await request(app).post('/x')).status, 429);
    assert.equal(seen.length, 1, 'six blocked requests are one signal');
    assert.deepEqual(seen[0], { info: { limiter: 'probe', limit: 2, windowMs: 60_000 }, method: 'POST', path: '/x' });
  });

  test('a signal that cannot be recorded never changes the 429', async () => {
    const app = appWith(1, async () => { throw new Error('database down'); });
    await request(app).post('/x');
    const blocked = await request(app).post('/x');
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.code, 'TOO_MANY_REQUESTS');
  });
});
