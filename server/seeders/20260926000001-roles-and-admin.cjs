'use strict';

require('dotenv').config();
const bcrypt = require('bcryptjs');

const ROLES = [
  ['ADMIN', 'Institution administration: accounts, admission, departments, programmes, settings'],
  ['REGISTRAR', 'Academic administration: courses, offerings, lecturer assignment, registrations, timetable'],
  ['LECTURER', 'Teaching staff'],
  ['STUDENT', 'Students, including applicants who are not admitted yet'],
];

const PUBLISHED_DEFAULT_EMAIL = 'admin@scrs.local';
const PUBLISHED_DEFAULT_PASSWORD = 'Admin@12345';
const MIN_PRODUCTION_PASSWORD_LENGTH = 12;

const resolveAdminCredentials = () => {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (process.env.NODE_ENV === 'production') {
    if (!email || !password) {
      throw new Error(
        'SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in production — refusing to seed an admin without them.',
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
  resolveAdminCredentials,

  async up(queryInterface) {
    const { email, password } = resolveAdminCredentials();
    const now = new Date();
    for (const [name, description] of ROLES) {
      await queryInterface.sequelize.query(
        'INSERT IGNORE INTO roles (name, description, created_at, updated_at) VALUES (:name, :description, :now, :now)',
        { replacements: { name, description, now } },
      );
    }

    const [[admin]] = await queryInterface.sequelize.query("SELECT id FROM roles WHERE name = 'ADMIN'");

    await queryInterface.bulkInsert('users', [{
      role_id: admin.id,
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
