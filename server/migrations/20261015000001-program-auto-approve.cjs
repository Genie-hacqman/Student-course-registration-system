'use strict';

/**
 * Per-programme automatic registration approval. When set, a student's registration is approved as soon as it
 * passes every rule and the timetable check, with no registrar step. Off by default, so nothing changes until
 * an admin turns it on for a programme.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('programs', 'auto_approve', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('programs', 'auto_approve');
  },
};
