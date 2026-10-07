import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, query, login, sequelize } from './helpers.js';
import { createAdmin } from '../../scripts/create-admin.mjs';

const env = { email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD };

before(resetDatabase);
after(() => {
  Object.assign(process.env, { SEED_ADMIN_EMAIL: env.email ?? '', SEED_ADMIN_PASSWORD: env.password ?? '' });
  return sequelize.close();
});

const admins = () => query("SELECT u.email FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'ADMIN'");

test('with an admin present, nothing changes', async () => {
  const before = await admins();
  const result = await createAdmin();
  assert.equal(result.created, false);
  assert.deepEqual(await admins(), before);
});

test('refuses an email that belongs to another role, never promoting it', async () => {
  await query("DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM (SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'ADMIN') x)");
  await query("DELETE u FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'ADMIN'");
  process.env.SEED_ADMIN_EMAIL = 'registrar@scrs.local';
  process.env.SEED_ADMIN_PASSWORD = 'Anything@12345';
  await assert.rejects(createAdmin, /already belongs to a REGISTRAR account/);
  assert.equal((await admins()).length, 0);
});

test('creates an admin when there is none, and they can sign in', async () => {
  process.env.SEED_ADMIN_EMAIL = 'Recovered.Admin@test.local';
  process.env.SEED_ADMIN_PASSWORD = 'Recovered@12345';
  const result = await createAdmin();
  assert.deepEqual(result, { created: true, email: 'recovered.admin@test.local' });
  assert.deepEqual((await admins()).map((u) => u.email), ['recovered.admin@test.local']);
  const session = await login('recovered.admin@test.local', 'Recovered@12345');
  assert.equal(session.user.role.name, 'ADMIN');
  assert.equal((await createAdmin()).created, false, 'idempotent');
});
