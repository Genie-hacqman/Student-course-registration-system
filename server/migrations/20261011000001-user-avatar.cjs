'use strict';

/**
 * Profile pictures. Stored on the user (not the student) because applicants have no student record yet.
 * `avatar` is a ~256px JPEG/PNG/WebP data URL (a few tens of KB); the client crops and compresses it before upload.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'avatar', { type: Sequelize.TEXT('medium'), allowNull: true });
    await queryInterface.addColumn('users', 'avatar_updated_at', { type: Sequelize.DATE, allowNull: true });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'avatar_updated_at');
    await queryInterface.removeColumn('users', 'avatar');
  },
};
