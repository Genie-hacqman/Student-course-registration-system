import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, query, login, sequelize } from './helpers.js';
import { createSuperAdmin } from '../../scripts/create-super-admin.mjs';

// In test, the credentials fall back to the seeder's dev defaults unless SEED_ADMIN_* are set.
const env = { email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD };

before(resetDatabase);
after(() => {
  Object.assign(process.env, { SEED_ADMIN_EMAIL: env.email ?? '', SEED_ADMIN_PASSWORD: env.password ?? '' });
  return sequelize.close();
});

const superAdmins = () => query("SELECT u.email FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'SUPER_ADMIN'");

test('with a super admin present, nothing changes', async () => {
  const before = await superAdmins();
  const result = await createSuperAdmin();
  assert.equal(result.created, false);
  assert.deepEqual(await superAdmins(), before);
});

test('refuses an email that belongs to another role, never promoting it', async () => {
  await query("DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM (SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'SUPER_ADMIN') x)");
  await query("DELETE u FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'SUPER_ADMIN'");
  process.env.SEED_ADMIN_EMAIL = 'registrar@scrs.local';
  process.env.SEED_ADMIN_PASSWORD = 'Anything@12345';
  await assert.rejects(createSuperAdmin, /already belongs to a REGISTRAR account/);
  assert.equal((await superAdmins()).length, 0);
});

test('creates the super admin when there is none, and they can sign in', async () => {
  process.env.SEED_ADMIN_EMAIL = 'Recovered.Admin@test.local';
  process.env.SEED_ADMIN_PASSWORD = 'Recovered@12345';
  const result = await createSuperAdmin();
  assert.deepEqual(result, { created: true, email: 'recovered.admin@test.local' });
  assert.deepEqual((await superAdmins()).map((u) => u.email), ['recovered.admin@test.local']);
  const session = await login('recovered.admin@test.local', 'Recovered@12345');
  assert.equal(session.user.role.name, 'SUPER_ADMIN');
  assert.equal((await createSuperAdmin()).created, false, 'idempotent');
});
