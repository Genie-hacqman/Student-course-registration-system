'use strict';

module.exports = {
  async up(queryInterface) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Refusing to run a demo seeder in production. Use `npm run db:seed` (roles + essential settings only).');
    }
    const q = queryInterface.sequelize;
    await q.query("UPDATE settings SET value = :value WHERE `key` = 'institution.studentEmailDomain'", {
      replacements: { value: JSON.stringify('students.scrs.edu') },
    });
    await q.query("UPDATE programs SET qualification_code = 'BSC' WHERE code = 'BSC-CS'");
  },

  async down(queryInterface) {
    const q = queryInterface.sequelize;
    await q.query("UPDATE settings SET value = :value WHERE `key` = 'institution.studentEmailDomain'", { replacements: { value: JSON.stringify('') } });
    await q.query("UPDATE programs SET qualification_code = NULL WHERE code = 'BSC-CS'");
  },
};
