'use strict';

require('dotenv').config();
const bcrypt = require('bcryptjs');

const ROLES = [
  ['USER', 'Student account'],
  ['LECTURER', 'Teaching staff'],
  ['ACADEMIC_ADVISOR', 'Approves student registrations'],
  ['REGISTRAR', 'Manages academic periods and registrations'],
  ['ADMIN', 'System administrator'],
  ['SUPER_ADMIN', 'Full access, including roles and settings'],
];

// Published in the project's own docs/tests — never acceptable as a real credential.
const PUBLISHED_DEFAULT_EMAIL = 'admin@scrs.local';
const PUBLISHED_DEFAULT_PASSWORD = 'Admin@12345';
const MIN_PRODUCTION_PASSWORD_LENGTH = 12;

/**
 * In production, refuses to fall back to the published default admin credentials.
 * Everywhere else (dev/test), keeps the convenient defaults so local setup needs no config.
 */
const resolveAdminCredentials = () => {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (process.env.NODE_ENV === 'production') {
    if (!email || !password) {
      throw new Error(
        'SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in production — refusing to seed a super admin without them.',
      );
    }
    if (password === PUBLISHED_DEFAULT_PASSWORD) {
      throw new Error(
        `SEED_ADMIN_PASSWORD must not be the published default ("${PUBLISHED_DEFAULT_PASSWORD}") — it is publicly known.`,
      );
    }
    if (password.length < MIN_PRODUCTION_PASSWORD_LENGTH) {
      throw new Error(`SEED_ADMIN_PASSWORD must be at least ${MIN_PRODUCTION_PASSWORD_LENGTH} characters in production.`);
    }
    return { email: email.toLowerCase(), password };
  }

  return { email: (email || PUBLISHED_DEFAULT_EMAIL).toLowerCase(), password: password || PUBLISHED_DEFAULT_PASSWORD };
};

module.exports = {
  // Shared with `npm run admin:create` (scripts/create-super-admin.mjs), so both apply the same rules.
  resolveAdminCredentials,

  async up(queryInterface) {
    const { email, password } = resolveAdminCredentials();
    const now = new Date();
    await queryInterface.bulkInsert(
      'roles',
      ROLES.map(([name, description]) => ({ name, description, created_at: now, updated_at: now })),
    );

    const [[superAdmin]] = await queryInterface.sequelize.query(
      "SELECT id FROM roles WHERE name = 'SUPER_ADMIN'",
    );

    await queryInterface.bulkInsert('users', [{
      role_id: superAdmin.id,
      first_name: 'System',
      last_name: 'Administrator',
      email,
      password_hash: await bcrypt.hash(password, 12),
      status: 'active',
      email_verified_at: now,
      created_at: now,
      updated_at: now,
    }]);
  },

  async down(queryInterface) {
    const { email } = resolveAdminCredentials();
    await queryInterface.bulkDelete('users', { email });
    await queryInterface.bulkDelete('roles', null, {});
  },
};
