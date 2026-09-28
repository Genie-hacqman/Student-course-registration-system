/**
 * The subdomain deployment (app.X / api.X) relies on the browser sending the refresh cookie on a
 * cross-origin, same-site request. That only happens if the credentialed CORS handshake is right:
 * the response must echo back the exact requesting origin (never "*") and set
 * Access-Control-Allow-Credentials: true. These tests prove that mechanism actually works,
 * against whatever CORS_ORIGIN is configured — see env.js for the production-only checks that
 * stop it from being misconfigured (wildcard, http, or a leftover dev origin) in the first place.
 */
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
