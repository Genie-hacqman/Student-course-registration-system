import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// A queryInterface that throws if any of its methods are actually called — proves the guard
// runs before any database work is attempted, not just that up() eventually rejects.
const untouchableQueryInterface = new Proxy(
  {},
  { get: () => () => { throw new Error('queryInterface should not have been touched'); } },
);

const ORIGINAL_ENV = { ...process.env };
const restoreEnv = () => {
  for (const key of Object.keys(process.env)) if (!(key in ORIGINAL_ENV)) delete process.env[key];
  Object.assign(process.env, ORIGINAL_ENV);
};

describe('demo seeders refuse to run in production', () => {
  const demoSeeders = [
    '../../seeders/20260926000002-demo-academic-data.cjs',
    '../../seeders/20260927000001-program-courses-and-settings.cjs',
    '../../seeders/20260929000001-demo-grade-scale-and-rules.cjs',
    '../../seeders/20261003000002-demo-teaching-and-announcements.cjs',
    '../../seeders/20261004000002-demo-student-accounts.cjs',
  ];

  afterEach(restoreEnv);

  for (const path of demoSeeders) {
    test(`${path.split('/').pop()} throws immediately when NODE_ENV=production`, async () => {
      process.env.NODE_ENV = 'production';
      // eslint-disable-next-line global-require
      const seeder = require(path);
      await assert.rejects(() => seeder.up(untouchableQueryInterface, {}), /production/i);
    });
  }
});

describe('the admin seeder rejects unsafe production credentials', () => {
  // Required once: the module's own `require('dotenv').config()` runs a single time here, reading
  // whatever real .env is on disk. Because the module is then cached, later tests' env mutations
  // (delete/set) are what resolveAdminCredentials() actually sees when up() is called — dotenv
  // does not run again to repopulate deleted vars from the file.
  const seeder = require('../../seeders/20260926000001-roles-and-admin.cjs');

  afterEach(restoreEnv);

  test('rejects when SEED_ADMIN_EMAIL/PASSWORD are unset in production', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SEED_ADMIN_EMAIL;
    delete process.env.SEED_ADMIN_PASSWORD;
    await assert.rejects(() => seeder.up(untouchableQueryInterface), /must be set in production/i);
  });

  test('rejects the published default password in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SEED_ADMIN_EMAIL = 'admin@real-university.edu';
    process.env.SEED_ADMIN_PASSWORD = 'Admin@12345';
    await assert.rejects(() => seeder.up(untouchableQueryInterface), /published default/i);
  });

  test('rejects a too-short password in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SEED_ADMIN_EMAIL = 'admin@real-university.edu';
    process.env.SEED_ADMIN_PASSWORD = 'Short1!';
    await assert.rejects(() => seeder.up(untouchableQueryInterface), /at least 12 characters/i);
  });

  test('proceeds with a real, distinct, long-enough password in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SEED_ADMIN_EMAIL = 'admin@real-university.edu';
    process.env.SEED_ADMIN_PASSWORD = 'ReallyStrongPassphrase9!';

    const calls = [];
    const fakeQueryInterface = {
      bulkInsert: async (table, rows) => { calls.push({ table, rows }); },
      sequelize: { query: async () => [[{ id: 1 }]] },
    };
    await seeder.up(fakeQueryInterface);

    const userInsert = calls.find((c) => c.table === 'users');
    assert.ok(userInsert, 'expected the admin user to be inserted');
    assert.equal(userInsert.rows[0].email, 'admin@real-university.edu');
    assert.notEqual(userInsert.rows[0].password_hash, 'ReallyStrongPassphrase9!', 'password must be hashed, not stored raw');
  });

  test('keeps the dev-friendly defaults outside production', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.SEED_ADMIN_EMAIL;
    delete process.env.SEED_ADMIN_PASSWORD;

    const calls = [];
    const fakeQueryInterface = {
      bulkInsert: async (table, rows) => { calls.push({ table, rows }); },
      sequelize: { query: async () => [[{ id: 1 }]] },
    };
    await seeder.up(fakeQueryInterface);

    const userInsert = calls.find((c) => c.table === 'users');
    assert.equal(userInsert.rows[0].email, 'admin@scrs.local');
  });
});
