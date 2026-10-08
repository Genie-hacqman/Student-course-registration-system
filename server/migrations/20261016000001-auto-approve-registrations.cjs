'use strict';

// The seeder inserts with INSERT IGNORE, so databases seeded earlier still hold `true`.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      "UPDATE settings SET value = 'false', updated_at = NOW() WHERE `key` = 'registration.requireApproval'",
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "UPDATE settings SET value = 'true', updated_at = NOW() WHERE `key` = 'registration.requireApproval'",
    );
  },
};
