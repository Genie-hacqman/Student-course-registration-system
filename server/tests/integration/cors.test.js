import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import env from '../../src/config/env.js';
import { api, sequelize } from './helpers.js';

const allowedOrigin = env.corsOrigins[0];

after(() => sequelize.close());

describe('CORS: the credentialed cross-origin handshake', () => {
  test('a request from the configured origin is granted credentialed access', async () => {
    const res = await api().get('/api/health').set('Origin', allowedOrigin);
    assert.equal(res.headers['access-control-allow-origin'], allowedOrigin);
    assert.equal(res.headers['access-control-allow-credentials'], 'true');
  });

  test('a request from an origin not in CORS_ORIGIN is not granted access', async () => {
    const res = await api().get('/api/health').set('Origin', 'https://not-allowed.example.com');
    assert.notEqual(res.headers['access-control-allow-origin'], 'https://not-allowed.example.com');
    assert.notEqual(res.headers['access-control-allow-origin'], '*');
  });

  test('a credentialed preflight for the refresh endpoint succeeds', async () => {
    const res = await api()
      .options('/api/auth/refresh')
      .set('Origin', allowedOrigin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');
    assert.equal(res.status, 204);
    assert.equal(res.headers['access-control-allow-origin'], allowedOrigin);
    assert.equal(res.headers['access-control-allow-credentials'], 'true');
  });
});
